import { openRouterService } from './openrouter-service';
import type { OpenRouterChatMessage } from './openrouter-service';
import { storageService } from './storage-service';
import { cloudflareKvService } from './cloudflare-kv-service';
import type { Computer } from '../store/types';

interface ToolArgs {
  computer_id?: string;
  repo_path?: string;
  task_description?: string;
  provider?: string;
}

interface ToolCall {
  tool: string;
  args: ToolArgs;
}

interface MobileComputerSummary {
  id: string;
  name: string;
  status: Computer['status'];
  lastHeartbeat?: string;
  repos: string[];
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function isToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { tool?: unknown; args?: unknown };
  return typeof candidate.tool === 'string' && !!candidate.args && typeof candidate.args === 'object';
}

class AgentOrchestratorService {

  async getAvailableModels() {
    const models: Array<{ id: string; name: string; provider: string }> = [];
    const errors: Array<{ provider: string; error: string }> = [];

    if (storageService.hasApiKey('openrouter')) {
      try {
        models.push(...await openRouterService.getModels());
      } catch (err) {
        errors.push({ provider: 'openrouter', error: getErrorMessage(err) });
      }
    }

    return { models, errors };
  }

  async chat(messages: OpenRouterChatMessage[], selectedModel: string): Promise<OpenRouterChatMessage> {
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
- If you know the environment, you can look up repos using list_repos(computer_id).
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one.

When using tools, output a JSON object in the format:
{"tool": "tool_name", "args": {...}}
Only output ONE tool call at a time. Stop and wait for the result.
If you don't need to use a tool, just reply with text.
`;

    const fullMessages = [...messages];
    if (fullMessages.length === 0 || fullMessages[0].role !== 'system') {
      fullMessages.unshift({ role: 'system', content: systemPrompt });
    }

    // 2. Parse model
    let model = selectedModel;
    if (selectedModel.startsWith('openrouter/')) {
        model = selectedModel.replace('openrouter/', '');
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
        let toolCall: ToolCall | null = null;
        try {
            // fast/simple check for JSON block
            const jsonMatch = content.match(/\{.*"tool":.*"args":.*\}/s);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (isToolCall(parsed)) toolCall = parsed;
            } else if (content.trim().startsWith('{')) {
                const parsed = JSON.parse(content);
                if (isToolCall(parsed)) toolCall = parsed;
            }
        } catch {
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
        return { role: 'assistant', content: "I encountered an error: " + getErrorMessage(err) };
    }
  }

  async executeTool(toolCall: ToolCall) {
    const { tool, args } = toolCall;

    switch (tool) {
        case 'list_computers':
            return await this.listComputers();
        case 'list_repos':
            if (!args.computer_id) return { error: "Missing computer_id." };
            return await this.listRepos(args.computer_id);
        case 'start_task':
            return await this.startTask(args);
        default:
            return { error: `Unknown tool: ${tool}` };
    }
  }

  async listComputers(): Promise<MobileComputerSummary[] | { error: string }> {
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
    } catch (err) {
        return { error: getErrorMessage(err) };
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
    } catch (err) {
        return { error: getErrorMessage(err) };
    }
  }

  async startTask(args: ToolArgs) {
    // args: { computer_id, repo_path, task_description, provider }
    // Dispatch remote task via Cloudflare KV
    try {
        if (!args.computer_id || !args.repo_path || !args.task_description) {
            return { error: "Missing required task arguments." };
        }

        await cloudflareKvService.ensureNamespace();

        const task = {
             tool: args.provider || 'jules',
             repo: args.repo_path,
             prompt: args.task_description
        };

        await cloudflareKvService.enqueueDeviceTask(args.computer_id, task);

        return { success: true, message: "Task dispatched to remote device." };

    } catch (err) {
        return { error: getErrorMessage(err) };
    }
  }
}

export const agentOrchestratorService = new AgentOrchestratorService();
export default agentOrchestratorService;
