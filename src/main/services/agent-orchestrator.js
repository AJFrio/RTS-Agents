const openRouterService = require('./openrouter-service');
const cloudflareKvService = require('./cloudflare-kv-service');
const configStore = require('./config-store');

class AgentOrchestrator {
  constructor() {
    this.createTaskCallback = null;
  }

  setCreateTaskCallback(callback) {
    this.createTaskCallback = callback;
  }

  async chat(messages, selectedModel) {
    // 1. Prepare messages (append system prompt if not present)
    const systemPrompt = `You are an intelligent agent orchestrator for the RTS Agents system.
Your goal is to help the user accomplish coding tasks by dispatching them to the correct environment and repository.

You have access to the following tools:
1. list_computers(): Returns a list of available computers and their status.
2. list_repos(computer_id): Returns a list of repositories available on a specific computer.
3. start_task(computer_id, repo_path, task_description, provider): Starts a coding task.
   - provider should be one of: 'jules', 'cursor', 'gemini', 'codex', 'claude-cli'.

Workflow:
- If the user asks to do something, first understand WHICH environment and repo they are talking about.
- If you don't know the environment, use list_computers() to see what's available.
- If you know the environment but not the repo, use list_repos(computer_id).
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one (default to 'jules' or 'gemini').

When using tools, output a JSON object in the format:
{"tool": "tool_name", "args": {...}}
Only output ONE tool call at a time. Stop and wait for the result.
If you don't need to use a tool, just reply with text.
`;

    // Check if system prompt is already there (it shouldn't be for user messages)
    let fullMessages = [...messages];
    if (fullMessages.length === 0 || fullMessages[0].role !== 'system') {
      fullMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // 2. Parse model
    let model = selectedModel;
    if (selectedModel.startsWith('openrouter/')) {
        model = selectedModel.replace('openrouter/', '');
    } else if (selectedModel.startsWith('openai/')) {
        model = selectedModel.replace('openai/', '');
    } else if (selectedModel.startsWith('anthropic/')) {
        model = selectedModel.replace('anthropic/', '');
    } else if (selectedModel.startsWith('gemini/')) {
        model = selectedModel.replace('gemini/', '');
    }

    try {
        // We use OpenRouterService as the generic gateway
        // If the user provided a specific key for OpenAI/Gemini/Anthropic in the future,
        // we might want to use their specific services, but OpenRouterService is a good unified interface
        // if we route through it.
        // HOWEVER, OpenRouterService requires an OpenRouter API key.
        // If the user selected "openai/gpt-4o" but only provided an OpenAI key (not OpenRouter),
        // this will fail if we force it through OpenRouterService.

        // Check keys. If we have OpenRouter key, use OpenRouterService.
        // If not, and we have OpenAI key and it's an OpenAI model, use generic OpenAI fetch?
        // Since I only implemented OpenRouterService (which expects OpenRouter key),
        // I should probably support using the provider keys directly if OpenRouter key is missing?
        // Or just assume the user uses OpenRouter for the "Meta-Agent".
        // The user asked for "model api key section... for openrouter, anthropic, openai, gemini".
        // This implies they might want to use those direct keys.

        // For simplicity in this iteration, I will assume OpenRouter is the primary "Orchestrator" brain
        // OR I will hack OpenRouterService to accept a different Base URL/Key if needed.
        // Actually, OpenRouterService is just a fetch wrapper. I can instantiate it with different config?
        // No, it's a singleton.

        // Let's assume for V1 that the Orchestrator uses OpenRouter.
        // If the user wants to use their OpenAI key, they should probably put it in OpenRouter or I need a generic LLM service.
        // I'll stick to OpenRouterService for now. If it fails (no key), I'll return an error.

        if (!configStore.hasApiKey('openrouter')) {
             // Fallback: If OpenAI key exists and model is openai, maybe try to use it?
             // But I haven't implemented a generic OpenAI chat service (CodexService is assistants).
             return { role: 'assistant', content: "Please configure an OpenRouter API key in Settings to use the Agent Orchestrator." };
        }

        const response = await openRouterService.chat(fullMessages, model);

        // 3. Handle Tool Calls
        if (!response || !response.choices || !response.choices[0]) {
            throw new Error("Invalid response from LLM provider");
        }

        const content = response.choices[0].message.content;
        let toolCall = null;
        try {
            // fast/simple check for JSON block
            const jsonMatch = content.match(/\{.*"tool":.*"args":.*\}/s);
            if (jsonMatch) {
                toolCall = JSON.parse(jsonMatch[0]);
            } else if (content.trim().startsWith('{')) {
                toolCall = JSON.parse(content);
            }
        } catch (e) {
            // Not valid JSON, treat as text
        }

        if (toolCall && toolCall.tool) {
            // Execute Tool
            const result = await this.executeTool(toolCall);

            const toolMessage = {
                role: 'user', // representing the system feeding back the result
                content: `Tool '${toolCall.tool}' Output: ${JSON.stringify(result)}`
            };

            // Recursive call
            // We append the assistant's tool call (as text) and the result
            const nextMessages = [...fullMessages, response.choices[0].message, toolMessage];

            // Recursion safety: prevent infinite loops (max 5 turns)
            const turnCount = fullMessages.filter(m => m.role === 'user' && m.content.startsWith('Tool')).length;
            if (turnCount > 5) {
                return { role: 'assistant', content: "I'm stuck in a loop. Here is the last result: " + JSON.stringify(result) };
            }

            return await this.chat(nextMessages, selectedModel);
        }

        return response.choices[0].message;

    } catch (err) {
        console.error("Orchestrator error:", err);
        return { role: 'assistant', content: "I encountered an error: " + err.message };
    }
  }

  async executeTool(toolCall) {
    const { tool, args } = toolCall;

    switch (tool) {
        case 'list_computers':
            return await this.listComputers();
        case 'list_repos':
            return await this.listRepos(args.computer_id);
        case 'start_task':
            return await this.startTask(args);
        default:
            return { error: `Unknown tool: ${tool}` };
    }
  }

  async listComputers() {
    try {
        if (!configStore.hasCloudflareConfig()) {
             return { error: "Cloudflare KV not configured. Cannot list computers." };
        }
        const namespaceId = await cloudflareKvService.ensureNamespace(); // default 'rtsa'
        const devices = await cloudflareKvService.getValueJson(namespaceId, 'devices', []);

        // Filter/Map for relevant info
        return devices.map(d => ({
            id: d.id,
            name: d.name,
            status: d.status,
            lastHeartbeat: d.lastHeartbeat,
            repos: d.repos ? d.repos.map(r => r.name) : []
        }));
    } catch (err) {
        return { error: err.message };
    }
  }

  async listRepos(computerId) {
    try {
        if (!configStore.hasCloudflareConfig()) {
             return { error: "Cloudflare KV not configured." };
        }
        const namespaceId = await cloudflareKvService.ensureNamespace();
        const devices = await cloudflareKvService.getValueJson(namespaceId, 'devices', []);
        const device = devices.find(d => d.id === computerId);

        if (!device) return { error: "Computer not found" };
        return device.repos || [];
    } catch (err) {
        return { error: err.message };
    }
  }

  async startTask(args) {
    // args: { computer_id, repo_path, task_description, provider }
    if (!this.createTaskCallback) {
        return { error: "Task execution not available (callback not set)" };
    }

    try {
        // Construct options for tasks:create
        const options = {
            prompt: args.task_description,
            projectPath: args.repo_path, // for remote/local
            repository: args.repo_path, // fallback
            targetDeviceId: args.computer_id === 'local' ? null : args.computer_id
        };

        // If computer_id is THIS machine, use local
        const localId = configStore.getOrCreateDeviceIdentity().id;
        if (options.targetDeviceId === localId) {
            options.targetDeviceId = null;
        }

        const result = await this.createTaskCallback({
            provider: args.provider || 'jules',
            options: options
        });

        if (result.success) {
            return { success: true, task: result.task };
        } else {
            return { error: result.error };
        }
    } catch (err) {
        return { error: err.message };
    }
  }
}

module.exports = new AgentOrchestrator();
