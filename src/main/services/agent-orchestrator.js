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

  async getAvailableModels() {
    const models = [];
    const errors = [];

    if (configStore.hasApiKey('openrouter')) {
      try {
        models.push(...await openRouterService.getModels());
      } catch (err) {
        errors.push({ provider: 'openrouter', error: err.message });
      }
    }

    return { models, errors };
  }

  async chat(messages, selectedModel, options = {}) {
    const maxToolTurns = typeof options.maxToolTurns === 'number' ? options.maxToolTurns : 5;

    // 1. Prepare messages (append system prompt if not present)
    const systemPrompt = `You are an intelligent agent orchestrator for the RTS Agents system.
Your goal is to help the user accomplish coding tasks by dispatching them to the correct environment and repository.

You have access to the following tools:
1. list_computers(): Returns a list of available computers and their status.
2. list_repos(computer_id): Returns a list of repositories available on a specific computer.
3. start_task(computer_id, repo_path, task_description, provider): Starts a coding task.
   - provider should be one of: 'jules', 'cursor', 'antigravity', 'codex', 'claude-cli', 'opencode'.

Workflow:
- If the user asks to do something, first understand WHICH environment and repo they are talking about.
- If you don't know the environment, use list_computers() to see what's available.
- If you know the environment but not the repo, use list_repos(computer_id).
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one (default to 'jules' or 'antigravity').

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
    }

    try {
        let conversation = fullMessages;
        let toolTurns = 0;

        if (!configStore.hasApiKey('openrouter')) {
             return { role: 'assistant', content: "Please configure an OpenRouter API key in Settings to use the Agent Orchestrator." };
        }

        while (toolTurns <= maxToolTurns) {
            const response = await openRouterService.chat(conversation, model);

            if (!response || !response.choices || !response.choices[0]) {
                throw new Error("Invalid response from LLM provider");
            }

            const assistantMessage = response.choices[0].message;
            const content = assistantMessage.content || '';
            let toolCall = null;
            try {
                const jsonMatch = content.match(/\{.*"tool":.*"args":.*\}/s);
                if (jsonMatch) {
                    toolCall = JSON.parse(jsonMatch[0]);
                } else if (content.trim().startsWith('{')) {
                    toolCall = JSON.parse(content);
                }
            } catch {
                // Not valid JSON, treat as text
            }

            if (!toolCall || !toolCall.tool) {
                return assistantMessage;
            }

            if (toolTurns >= maxToolTurns) {
                const result = await this.executeTool(toolCall);
                return {
                    role: 'assistant',
                    content: "I'm stuck in a loop. Here is the last result: " + JSON.stringify(result)
                };
            }

            const result = await this.executeTool(toolCall);
            const toolMessage = {
                role: 'user',
                content: `Tool '${toolCall.tool}' Output: ${JSON.stringify(result)}`
            };

            conversation = [...conversation, assistantMessage, toolMessage];
            toolTurns += 1;
        }

        return { role: 'assistant', content: "Maximum tool turns reached." };

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
