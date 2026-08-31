const openRouterService = require('./openrouter-service');
const cloudflareKvService = require('./cloudflare-kv-service');
const configStore = require('./config-store');

const TOOL_TRACE_RESULT_CHARS = 2000;
const TASK_CARD_FIELDS = ['id', 'provider', 'name', 'status', 'prompt', 'repository', 'branch', 'rawId', 'filePath', 'summary', 'createdAt', 'updatedAt'];

class AgentOrchestrator {
  constructor() {
    this.createTaskCallback = null;
    this.listTasksCallback = null;
  }

  setCreateTaskCallback(callback) {
    this.createTaskCallback = callback;
  }

  setListTasksCallback(callback) {
    this.listTasksCallback = callback;
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
    const maxToolTurns = typeof options.maxToolTurns === 'number' ? options.maxToolTurns : 8;
    const systemPrompt = `You are an intelligent agent orchestrator for the RTS Agents system.
Your goal is to help the user accomplish coding tasks by dispatching them to the correct environment and repository, and to answer questions about their existing tasks.

You have access to the following tools:
1. list_computers(): Returns a list of available computers/devices and their status.
2. list_repos(computer_id): Returns a list of repositories available on a specific computer.
3. list_tasks(provider, repo, status, limit): Returns recent tasks. Filter optionally by
   provider ('jules', 'cursor', 'antigravity', 'codex', 'claude-cli', 'claude-cloud', 'opencode'),
   repo (substring match on repository path/name), status ('running', 'completed', 'failed',
   'pending'), and limit (default 25).
4. start_task(computer_id, repo_path, task_description, provider): Starts a coding task.
   - provider should be one of: 'jules', 'cursor', 'antigravity', 'codex', 'claude-cli', 'opencode'.
5. show_task(task_id): Surfaces a card in the chat with an overview of an existing task so the
   user can click it to open the full transcript.

Workflow:
- If the user asks to do something, first understand WHICH environment and repo they are talking about.
- If you don't know the environment, use list_computers() to see what's available.
- If you know the environment but not the repo, use list_repos(computer_id).
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one (default to 'jules' or 'antigravity').
- If the user asks about existing or previous tasks, use list_tasks() (with filters if they named a repo or harness) and answer from the results.
- ALWAYS call show_task(task_id) for any task you start or that the user asks about, so the card appears in the chat.
- You may take multiple actions in one reply (list computers, then repos, then start a task) before answering.

When using tools, output a JSON object in the format:
{"tool": "tool_name", "args": {...}}
Only output ONE tool call at a time. Stop and wait for the result.
If you don't need to use a tool, just reply with text.
`;

    let fullMessages = [...messages];
    if (fullMessages.length === 0 || fullMessages[0].role !== 'system') {
      fullMessages.unshift({ role: 'system', content: systemPrompt });
    }

    let model = selectedModel;
    if (model && model.startsWith('openrouter/')) {
        model = model.replace('openrouter/', '');
    }

    const toolCalls = [];
    const taskCards = [];

    try {
        let conversation = fullMessages;
        let toolTurns = 0;

        if (!configStore.hasApiKey('openrouter')) {
             return { role: 'assistant', content: "Please configure an OpenRouter API key in Settings to use the Agent Orchestrator.", toolCalls, taskCards };
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
                return { ...assistantMessage, toolCalls, taskCards };
            }

            if (toolTurns >= maxToolTurns) {
                const result = await this.executeTool(toolCall, taskCards);
                toolCalls.push(this.traceEntry(toolCall, result));
                return {
                    role: 'assistant',
                    content: "I'm stuck in a loop. Here is the last result: " + JSON.stringify(result),
                    toolCalls,
                    taskCards,
                };
            }

            const result = await this.executeTool(toolCall, taskCards);
            toolCalls.push(this.traceEntry(toolCall, result));
            const toolMessage = {
                role: 'user',
                content: `Tool '${toolCall.tool}' Output: ${JSON.stringify(result)}`
            };

            conversation = [...conversation, assistantMessage, toolMessage];
            toolTurns += 1;
        }

        return { role: 'assistant', content: "Maximum tool turns reached.", toolCalls, taskCards };

    } catch (err) {
        console.error("Orchestrator error:", err);
        return { role: 'assistant', content: "I encountered an error: " + err.message, toolCalls, taskCards };
    }
  }

  traceEntry(toolCall, result) {
    let resultText;
    try {
      resultText = JSON.stringify(result);
    } catch {
      resultText = String(result);
    }
    if (resultText && resultText.length > TOOL_TRACE_RESULT_CHARS) {
      resultText = resultText.slice(0, TOOL_TRACE_RESULT_CHARS) + '…';
    }
    return { tool: toolCall.tool, args: toolCall.args || {}, result: resultText };
  }

  cardFor(task) {
    if (!task || typeof task !== 'object') return null;
    const card = {};
    for (const field of TASK_CARD_FIELDS) {
      if (task[field] !== undefined && task[field] !== null) card[field] = task[field];
    }
    return Object.keys(card).length > 0 ? card : null;
  }

  async executeTool(toolCall, taskCards = null) {
    const { tool, args } = toolCall;

    switch (tool) {
        case 'list_computers':
            return await this.listComputers();
        case 'list_repos':
            return await this.listRepos(args.computer_id);
        case 'list_tasks':
            return await this.listTasks(args || {});
        case 'show_task':
            return await this.showTask(args?.task_id, taskCards);
        case 'start_task':
            return await this.startTask(args, taskCards);
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

  async listTasks(args = {}) {
    if (!this.listTasksCallback) {
        return { error: "Task listing is not available in this runtime." };
    }
    try {
        const agents = await this.listTasksCallback();
        const list = Array.isArray(agents) ? agents : [];
        const provider = args.provider ? String(args.provider).toLowerCase() : null;
        const repo = args.repo ? String(args.repo).toLowerCase() : null;
        const status = args.status ? String(args.status).toLowerCase() : null;
        const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 25;

        const filtered = list.filter((task) => {
            if (provider && String(task.provider || '').toLowerCase() !== provider) return false;
            if (repo && !String(task.repository || '').toLowerCase().includes(repo)) return false;
            if (status && String(task.status || '').toLowerCase() !== status) return false;
            return true;
        });

        return filtered.slice(0, limit).map((task) => ({
            id: task.id,
            provider: task.provider,
            name: task.name,
            status: task.status,
            repository: task.repository || null,
            updatedAt: task.updatedAt || null,
        }));
    } catch (err) {
        return { error: err.message };
    }
  }

  async showTask(taskId, taskCards = null) {
    if (!this.listTasksCallback) {
        return { error: "Task listing is not available in this runtime." };
    }
    if (!taskId) {
        return { error: "task_id is required" };
    }
    try {
        const agents = await this.listTasksCallback();
        const list = Array.isArray(agents) ? agents : [];
        const match = list.find((task) => task.id === taskId || task.rawId === taskId);
        if (!match) {
            return { error: `Task not found: ${taskId}` };
        }
        const card = this.cardFor(match);
        if (card && Array.isArray(taskCards) && !taskCards.some((c) => c.id === card.id)) {
            taskCards.push(card);
        }
        return {
            id: match.id,
            provider: match.provider,
            name: match.name,
            status: match.status,
            repository: match.repository || null,
            branch: match.branch || null,
            updatedAt: match.updatedAt || null,
        };
    } catch (err) {
        return { error: err.message };
    }
  }

  async startTask(args, taskCards = null) {
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
            const card = this.cardFor(result.task);
            if (card && Array.isArray(taskCards) && !taskCards.some((c) => c.id === card.id)) {
                taskCards.push(card);
            }
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
