import { openRouterService } from './openrouter-service';
import { geminiService } from './gemini-service';
import { storageService } from './storage-service';
import { cloudflareKvService } from './cloudflare-kv-service';

class AgentOrchestratorService {

  async getAvailableModels() {
    const models: any[] = [];
    const errors: any[] = [];

    // Check configuration and fetch models in parallel
    const promises: Promise<void | number>[] = [];

    // OpenRouter
    if (storageService.hasApiKey('openrouter')) {
      promises.push(
        openRouterService.getModels()
          .then(list => models.push(...list))
          .catch(err => errors.push({ provider: 'openrouter', error: err.message }))
      );
    }

    // OpenAI (Codex)
    if (storageService.hasApiKey('openai') || storageService.hasApiKey('codex')) {
      // Note: codexService in mobile app might not have getModels exposed or implemented similarly to electron
      // Assuming codexService connects to OpenAI, we might need to implement getModels there or here.
      // For now, let's assume codexService is for Assistants API, not generic Chat.
      // If we want generic OpenAI models, we should probably add getModels to codexService or create OpenAIService.
      // Re-using codexService for now if it supports it, otherwise skipping or mocking.
       // TODO: Implement getModels in codexService if needed, or use OpenRouter for everything.
    }

    // Anthropic (Claude)
    if (storageService.hasApiKey('claude')) {
       // Similarly, check if claudeService supports getModels.
    }

    // Gemini
    if (storageService.hasApiKey('gemini')) {
      promises.push(
        geminiService.getModels()
          .then(list => models.push(...list))
          .catch(err => errors.push({ provider: 'gemini', error: err.message }))
      );
    }

    await Promise.all(promises);

    return { models, errors };
  }

  async chat(messages: any[], selectedModel: string): Promise<any> {
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
- If you know the environment, you can look up repos using list_repos(computer_id).
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one.

When using tools, output a JSON object in the format:
{"tool": "tool_name", "args": {...}}
Only output ONE tool call at a time. Stop and wait for the result.
If you don't need to use a tool, just reply with text.
`;

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
        if (!storageService.hasApiKey('openrouter')) {
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

    } catch (err: any) {
        console.error("Orchestrator error:", err);
        return { role: 'assistant', content: "I encountered an error: " + err.message };
    }
  }

  async executeTool(toolCall: any) {
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
        if (!cloudflareKvService.isConfigured()) {
             return { error: "Cloudflare KV not configured. Cannot list computers." };
        }
        const computers = await cloudflareKvService.listComputers();

        // Filter/Map for relevant info
        return computers.map(d => ({
            id: d.id,
            name: d.name,
            status: d.status,
            lastHeartbeat: d.lastHeartbeat,
            repos: d.repos ? d.repos.map(r => r.name) : []
        }));
    } catch (err: any) {
        return { error: err.message };
    }
  }

  async listRepos(computerId: string) {
    try {
        if (!cloudflareKvService.isConfigured()) {
             return { error: "Cloudflare KV not configured." };
        }
        const computers = await cloudflareKvService.listComputers();
        const device = computers.find(d => d.id === computerId);

        if (!device) return { error: "Computer not found" };
        return device.repos || [];
    } catch (err: any) {
        return { error: err.message };
    }
  }

  async startTask(args: any) {
    // args: { computer_id, repo_path, task_description, provider }
    // Dispatch remote task via Cloudflare KV
    try {
        await cloudflareKvService.ensureNamespace();

        const task = {
             tool: args.provider || 'jules',
             repo: args.repo_path,
             prompt: args.task_description
        };

        await cloudflareKvService.enqueueDeviceTask(args.computer_id, task);

        return { success: true, message: "Task dispatched to remote device." };

    } catch (err: any) {
        return { error: err.message };
    }
  }
}

export const agentOrchestratorService = new AgentOrchestratorService();
export default agentOrchestratorService;
