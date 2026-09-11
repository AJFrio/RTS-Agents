/**
 * Agent orchestrator (web runtime).
 *
 * Same Janus tool loop as src/main/services/agent-orchestrator.js: native
 * OpenRouter tools with a JSON-in-text fallback, parallel read tools, and
 * surface cards. Web adapters replace desktop FS / IPC:
 *   - tasks via hub callbacks (list / peek / create)
 *   - devices / remote dispatch via Cloudflare KV
 *   - GitHub via the worker-proxy github service
 * Local-only tools (create_local_repo, pull_repo) return a clear error.
 */

const TOOL_TRACE_RESULT_CHARS = 2000;
const CARD_SURFACE_LIMIT = 8;
const READ_TOOLS = new Set([
  'list_computers',
  'list_repos',
  'list_tasks',
  'list_github_repos',
  'list_pull_requests',
  'show_task',
  'show_device',
  'show_repo',
  'show_pull_request',
]);
const TASK_CARD_FIELDS = [
  'id',
  'provider',
  'name',
  'status',
  'prompt',
  'repository',
  'branch',
  'rawId',
  'filePath',
  'summary',
  'createdAt',
  'updatedAt',
];
const PROVIDER_ENUM = [
  'jules',
  'cursor',
  'antigravity',
  'codex',
  'claude-cli',
  'claude-cloud',
  'opencode',
];
const TASK_STATUS_ENUM = ['running', 'completed', 'failed', 'pending'];
const CLOUD_PROVIDERS = new Set(['jules', 'cursor', 'claude-cloud']);

const SYSTEM_PROMPT = `You are Janus, the orchestrator for the RTS Agents system.
Help the user accomplish coding tasks by dispatching them to the correct environment and repository, and answer questions about tasks, devices, repos, and pull requests.

This session is the RTS web app (phone or browser). You have the same tools as desktop Janus — use them. Do not claim you lack access to tasks, PRs, devices, or repos.

Web runtime notes:
- There is no local filesystem on this client. create_local_repo and pull_repo are unavailable.
- list_computers() lists desktops synced via Cloudflare KV. computer_id "local" means cloud harnesses (jules, cursor, claude-cloud) that run without a device.
- CLI harnesses (claude-cli, codex, opencode, antigravity) must use a synced device id from list_computers().
- list_tasks() and the live snapshot cover Jules / Cursor / Claude Cloud sessions on this dashboard.
- GitHub tools use the configured GitHub token.

Workflow:
- If the user asks to do something, first understand WHICH environment and repo they are talking about.
- If you don't know the environment, use list_computers() to see what's available.
- If you know the environment but not the repo, use list_repos(computer_id). Use list_github_repos() for GitHub remotes.
- Once you have the details, confirm with the user if needed, or proceed to start_task.
- If the user mentions a specific tool/agent (like "Use Jules"), respect that. Otherwise pick the most appropriate one (default to 'jules' or 'antigravity' on a device, 'jules' in the cloud).
- A live dashboard snapshot of running/pending tasks is included below when the cache is warm. Answer "what's running?" from that snapshot — do not call list_tasks just to repeat it.
- Use list_tasks() once only for history, a named filter, or when the snapshot is missing. list_* tools already surface cards — do not follow them with show_* for every item.
- Call show_* only for a single item the user named, or for something you just created.
- For merge_pull_request, close_pull_request, create_github_repo, and create_local_repo, only proceed when the user clearly asked for that write.
- You may take multiple actions in one reply before answering.
- Prefer native tool calls. If a model cannot emit them, output a single JSON object {"tool":"tool_name","args":{...}} and wait for the result.
`;

function functionTool(name, description, parameters) {
  return {
    type: 'function',
    function: { name, description, parameters },
  };
}

export const ORCHESTRATOR_TOOLS = [
  functionTool(
    'list_computers',
    'List synced remote devices (and a note when Cloudflare KV is not configured).',
    {
      type: 'object',
      properties: {},
    }
  ),
  functionTool(
    'list_repos',
    'List repositories on a synced computer. Use list_github_repos for GitHub remotes.',
    {
      type: 'object',
      properties: {
        computer_id: { type: 'string', description: 'Device id from list_computers.' },
      },
      required: ['computer_id'],
    }
  ),
  functionTool(
    'list_tasks',
    'List recent tasks, optionally filtered by harness, repo substring, or status.',
    {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: PROVIDER_ENUM },
        repo: { type: 'string', description: 'Substring match on repository path or name.' },
        status: { type: 'string', enum: TASK_STATUS_ENUM },
        limit: { type: 'integer', description: 'Max results (default 25).' },
      },
    }
  ),
  functionTool('start_task', 'Start a coding task on a computer and repository.', {
    type: 'object',
    properties: {
      computer_id: {
        type: 'string',
        description: 'Device id from list_computers, or "local" for cloud harnesses.',
      },
      repo_path: { type: 'string', description: 'Absolute path, repo name, or GitHub source.' },
      task_description: { type: 'string', description: 'The work to do.' },
      provider: { type: 'string', enum: PROVIDER_ENUM },
    },
    required: ['computer_id', 'repo_path', 'task_description', 'provider'],
  }),
  functionTool('show_task', 'Surface a clickable task card in the chat for an existing task.', {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task id from list_tasks or start_task.' },
    },
    required: ['task_id'],
  }),
  functionTool('show_device', 'Surface a clickable device card for a synced computer.', {
    type: 'object',
    properties: {
      computer_id: { type: 'string', description: 'Device id from list_computers.' },
    },
    required: ['computer_id'],
  }),
  functionTool(
    'show_repo',
    'Surface a clickable repository card (synced-device path or GitHub owner/name).',
    {
      type: 'object',
      properties: {
        computer_id: {
          type: 'string',
          description: 'Device id. Omit for GitHub remotes.',
        },
        repo_path: { type: 'string', description: 'Local path or folder name on that computer.' },
        owner: { type: 'string', description: 'GitHub owner (user or org).' },
        repo: { type: 'string', description: 'GitHub repository name.' },
      },
    }
  ),
  functionTool('list_github_repos', 'List GitHub repositories for the connected account.', {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max results (default 25).' },
    },
  }),
  functionTool(
    'create_local_repo',
    'Create a new local git repository. Unavailable in the web app.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder / repository name.' },
        directory: { type: 'string', description: 'Parent directory.' },
      },
      required: ['name'],
    }
  ),
  functionTool('create_github_repo', 'Create a GitHub repository for the connected account.', {
    type: 'object',
    properties: {
      name: { type: 'string' },
      private: { type: 'boolean' },
      owner: { type: 'string', description: 'Org login when owner_type is org.' },
      owner_type: { type: 'string', enum: ['user', 'org'] },
    },
    required: ['name'],
  }),
  functionTool(
    'pull_repo',
    'Run git pull in a local repository path. Unavailable in the web app.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the local git repo.' },
      },
      required: ['path'],
    }
  ),
  functionTool(
    'list_pull_requests',
    'List pull requests. Pass owner+repo for one repository, or omit to scan recent repos.',
    {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Default open.' },
        limit: { type: 'integer', description: 'Max results (default 20).' },
      },
    }
  ),
  functionTool('show_pull_request', 'Surface a clickable pull request card and return details.', {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      pr_number: { type: 'integer' },
    },
    required: ['owner', 'repo', 'pr_number'],
  }),
  functionTool(
    'merge_pull_request',
    'Merge a pull request. Only when the user clearly asked to merge.',
    {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pr_number: { type: 'integer' },
        method: { type: 'string', enum: ['merge', 'squash', 'rebase'] },
      },
      required: ['owner', 'repo', 'pr_number'],
    }
  ),
  functionTool(
    'close_pull_request',
    'Close a pull request without merging. Only when the user clearly asked to close.',
    {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pr_number: { type: 'integer' },
      },
      required: ['owner', 'repo', 'pr_number'],
    }
  ),
  functionTool('mark_pr_ready', 'Mark a draft pull request ready for review.', {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      pr_number: { type: 'integer' },
    },
    required: ['owner', 'repo', 'pr_number'],
  }),
];

function pushCard(cards, card) {
  if (!card || !Array.isArray(cards) || card.id == null) return;
  const kind = card.kind || 'task';
  if (
    cards.some(
      (existing) => (existing.kind || 'task') === kind && String(existing.id) === String(card.id)
    )
  ) {
    return;
  }
  cards.push({ ...card, kind });
}

const ACTIVE_TASK_STATUSES = new Set(['running', 'pending', 'queued']);
const TASK_STATUS_RANK = { running: 0, pending: 1, queued: 1, failed: 2, completed: 3 };

function formatTaskSnapshot(tasks) {
  const active = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => ACTIVE_TASK_STATUSES.has(String(task.status || '').toLowerCase()))
    .slice(0, CARD_SURFACE_LIMIT);

  if (active.length === 0) {
    return '\nLive dashboard snapshot: no running or pending tasks. Call list_tasks only for history, filters, or a refresh.\n';
  }

  const lines = active
    .map((task) => {
      const repo = task.repository ? ` @ ${task.repository}` : '';
      const name = task.name || 'untitled';
      return `- ${task.id} [${task.provider || '?'}] ${task.status} ${name}${repo}`;
    })
    .join('\n');

  return `\nLive dashboard snapshot (answer "what's running?" from this; list_tasks is cached if you need filters or history):\n${lines}\n`;
}

function sortTasksForListing(tasks) {
  return [...tasks].sort((left, right) => {
    const leftRank = TASK_STATUS_RANK[String(left.status || '').toLowerCase()] ?? 4;
    const rightRank = TASK_STATUS_RANK[String(right.status || '').toLowerCase()] ?? 4;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  });
}

function withCards(payload, cards) {
  const list = Array.isArray(cards) ? cards : [];
  return {
    ...payload,
    cards: list,
    taskCards: list.filter((card) => (card.kind || 'task') === 'task'),
  };
}

function parseToolArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonToolCall(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    const jsonMatch = content.match(/\{.*"tool":.*"args":.*\}/s);
    const parsed = JSON.parse(
      jsonMatch ? jsonMatch[0] : content.trim().startsWith('{') ? content : ''
    );
    if (parsed && parsed.tool) {
      return {
        tool: parsed.tool,
        args: parsed.args && typeof parsed.args === 'object' ? parsed.args : {},
      };
    }
  } catch {
    // Not valid JSON, treat as text
  }
  return null;
}

function isBrowserComputerId(computerId) {
  return !computerId || computerId === 'local' || computerId === 'web';
}

function localGitUnavailable(action) {
  return {
    error: `${action} is not available in the web app. Use a synced desktop from list_computers() or create_github_repo.`,
  };
}

function unwrapGithub(envelope, key) {
  if (!envelope) return { error: 'GitHub request failed' };
  if (envelope.success === false) {
    return { error: envelope.error || 'GitHub request failed' };
  }
  return envelope[key];
}

export function createAgentOrchestratorService({
  openrouter,
  storage,
  github = null,
  cloudflareKv = null,
} = {}) {
  let createTaskCallback = null;
  let listTasksCallback = null;
  let peekTasksCallback = null;
  let taskListPromise = null;

  function setCreateTaskCallback(callback) {
    createTaskCallback = callback;
  }

  function setListTasksCallback(callback, options = {}) {
    listTasksCallback = callback;
    peekTasksCallback = typeof options.peek === 'function' ? options.peek : null;
  }

  function clearTurnCaches() {
    taskListPromise = null;
  }

  async function loadTasks() {
    if (!listTasksCallback) return null;
    if (!taskListPromise) {
      taskListPromise = Promise.resolve(listTasksCallback()).then((list) =>
        Array.isArray(list) ? list : []
      );
    }
    return taskListPromise;
  }

  function extractRequestedTools(assistantMessage) {
    const native = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];
    if (native.length > 0) {
      return native
        .map((call) => ({
          id: call.id,
          tool: call.function?.name || call.name,
          args: parseToolArguments(call.function?.arguments ?? call.arguments),
          native: true,
        }))
        .filter((call) => call.tool);
    }
    const fallback = parseJsonToolCall(assistantMessage?.content || '');
    if (!fallback) return [];
    return [{ id: null, tool: fallback.tool, args: fallback.args, native: false }];
  }

  async function runRequestedTools(requested, cards, toolTurns) {
    const runOne = async (request, index) => {
      const result = await executeTool({ tool: request.tool, args: request.args }, cards);
      const callId = request.id || `call_${toolTurns}_${index}`;
      return { request, result, callId };
    };

    const canParallel =
      requested.length > 1 && requested.every((request) => READ_TOOLS.has(request.tool));
    if (canParallel) {
      return Promise.all(requested.map((request, index) => runOne(request, index)));
    }

    const executed = [];
    for (let index = 0; index < requested.length; index += 1) {
      executed.push(await runOne(requested[index], index));
    }
    return executed;
  }

  async function taskSnapshotNote() {
    const peeked = peekTasksCallback ? peekTasksCallback() : null;
    if (!Array.isArray(peeked)) return '';
    taskListPromise = Promise.resolve(peeked);
    return formatTaskSnapshot(peeked);
  }

  async function getAvailableModels() {
    const models = [];
    const errors = [];

    if (storage.hasApiKey('openrouter')) {
      try {
        models.push(...(await openrouter.getModels()));
      } catch (err) {
        errors.push({ provider: 'openrouter', error: err?.message || 'Unknown error' });
      }
    }

    return { models, errors };
  }

  async function chat(messages, selectedModel, options = {}) {
    const maxToolTurns = typeof options.maxToolTurns === 'number' ? options.maxToolTurns : 8;
    clearTurnCaches();

    let fullMessages = [...messages];
    const systemContent = SYSTEM_PROMPT + (await taskSnapshotNote());
    if (fullMessages.length === 0 || fullMessages[0].role !== 'system') {
      fullMessages.unshift({ role: 'system', content: systemContent });
    }

    let model = selectedModel;
    if (model && model.startsWith('openrouter/')) {
      model = model.replace('openrouter/', '');
    }

    const toolCalls = [];
    const cards = [];

    try {
      let conversation = fullMessages;
      let toolTurns = 0;

      if (!storage.hasApiKey('openrouter')) {
        return withCards(
          {
            role: 'assistant',
            content: 'Please configure an OpenRouter API key in Settings to use Janus.',
            toolCalls,
          },
          cards
        );
      }

      while (toolTurns <= maxToolTurns) {
        const response = await openrouter.chat(
          conversation,
          model || 'openai/gpt-4o',
          ORCHESTRATOR_TOOLS
        );

        if (!response || !response.choices || !response.choices[0]) {
          throw new Error('Invalid response from LLM provider');
        }

        const assistantMessage = response.choices[0].message;
        const requested = extractRequestedTools(assistantMessage);

        if (requested.length === 0) {
          return withCards({ ...assistantMessage, toolCalls }, cards);
        }

        const atCap = toolTurns >= maxToolTurns;
        const followUps = [];
        let lastResult = null;
        const executed = await runRequestedTools(requested, cards, toolTurns);

        for (const { request, result, callId } of executed) {
          lastResult = result;
          toolCalls.push(traceEntry({ tool: request.tool, args: request.args }, result));
          followUps.push({
            role: 'tool',
            tool_call_id: callId,
            content: JSON.stringify(result),
          });
          if (!request.native) {
            request.syntheticId = callId;
          }
          toolTurns += 1;
        }

        if (atCap) {
          return withCards(
            {
              role: 'assistant',
              content:
                "I'm stuck in a loop. Here is the last result: " + JSON.stringify(lastResult),
              toolCalls,
            },
            cards
          );
        }

        const historyAssistant = requested[0].native
          ? assistantMessage
          : {
              role: 'assistant',
              content: assistantMessage.content || '',
              tool_calls: requested.map((request) => ({
                id: request.syntheticId,
                type: 'function',
                function: {
                  name: request.tool,
                  arguments: JSON.stringify(request.args || {}),
                },
              })),
            };

        conversation = [...conversation, historyAssistant, ...followUps];
      }

      return withCards(
        { role: 'assistant', content: 'Maximum tool turns reached.', toolCalls },
        cards
      );
    } catch (err) {
      console.error('Orchestrator error:', err);
      return withCards(
        {
          role: 'assistant',
          content: 'I encountered an error: ' + (err?.message || 'Unknown error'),
          toolCalls,
        },
        cards
      );
    } finally {
      clearTurnCaches();
    }
  }

  function traceEntry(toolCall, result) {
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

  function cardFor(task) {
    if (!task || typeof task !== 'object') return null;
    const card = { kind: 'task' };
    for (const field of TASK_CARD_FIELDS) {
      if (task[field] !== undefined && task[field] !== null) card[field] = task[field];
    }
    return card.id ? card : null;
  }

  function requireGithub() {
    if (!storage.hasApiKey('github')) {
      return { error: 'GitHub is not configured. Add a personal access token in Plugins.' };
    }
    if (!github) {
      return { error: 'GitHub is not available in this runtime.' };
    }
    return null;
  }

  function deviceCard(device) {
    if (!device?.id) return null;
    return {
      kind: 'device',
      id: device.id,
      name: device.name,
      status: device.status,
      thisDevice: !!device.thisDevice,
      lastHeartbeat: device.lastHeartbeat || null,
      repos: device.repos || [],
      repoCount: Array.isArray(device.repos) ? device.repos.length : 0,
      platform: device.platform || null,
    };
  }

  function localRepoCard(repo, computer) {
    if (!repo) return null;
    const path = repo.path || repo.id;
    if (!path && !repo.name) return null;
    return {
      kind: 'repo',
      id: path || repo.name,
      source: 'local',
      name: repo.name || repo.displayName || (path ? path.split(/[\\/]/).pop() : null),
      path,
      computerId: computer?.id || null,
      computerName: computer?.name || null,
    };
  }

  function githubRepoCard(repo) {
    if (!repo) return null;
    const owner = repo.owner?.login || repo.owner;
    const name = repo.name;
    const fullName = repo.full_name || (owner && name ? `${owner}/${name}` : name);
    if (!fullName) return null;
    return {
      kind: 'repo',
      id: `gh:${fullName}`,
      source: 'github',
      name,
      owner,
      fullName,
      private: !!repo.private,
      htmlUrl: repo.html_url || null,
      defaultBranch: repo.default_branch || null,
      description: repo.description || null,
    };
  }

  function prCard(pr) {
    if (!pr) return null;
    const owner = pr.base?.repo?.owner?.login || pr.head?.repo?.owner?.login;
    const repo = pr.base?.repo?.name || pr.head?.repo?.name;
    if (pr.number == null || !owner || !repo) return null;
    return {
      kind: 'pr',
      id: `pr:${owner}/${repo}#${pr.number}`,
      number: pr.number,
      title: pr.title,
      owner,
      repo,
      fullName: pr.base?.repo?.full_name || `${owner}/${repo}`,
      state: pr.state || 'open',
      draft: !!pr.draft,
      author: pr.user?.login || null,
      createdAt: pr.created_at || null,
      htmlUrl: pr.html_url || null,
      nodeId: pr.node_id || null,
      baseBranch: pr.base?.ref || null,
      headBranch: pr.head?.ref || null,
      headSha: pr.head?.sha || null,
      body: pr.body || null,
    };
  }

  function summarizePr(pr) {
    const card = prCard(pr);
    if (!card) return null;
    return {
      number: card.number,
      title: card.title,
      repo: card.fullName,
      state: card.state,
      draft: card.draft,
      author: card.author,
      createdAt: card.createdAt,
      url: card.htmlUrl,
    };
  }

  function surfaceCards(cards, items, toCard) {
    if (!Array.isArray(cards) || !Array.isArray(items)) return;
    for (const item of items.slice(0, CARD_SURFACE_LIMIT)) {
      pushCard(cards, toCard(item));
    }
  }

  function summarizeDeviceRepos(repos) {
    if (!Array.isArray(repos)) return [];
    return repos
      .map((repo) => (typeof repo === 'string' ? repo : repo.name || repo.path))
      .filter(Boolean);
  }

  async function loadDevices() {
    if (!storage.hasCloudflareConfig() || !cloudflareKv) {
      return {
        configured: false,
        devices: [],
        note: 'Cloudflare KV is not configured, so no desktops are synced. Use computer_id "local" with jules, cursor, or claude-cloud for cloud tasks.',
      };
    }
    try {
      const devices = await cloudflareKv.listComputers();
      const listed = (Array.isArray(devices) ? devices : [])
        .filter((device) => device && device.id)
        .map((device) => ({
          id: device.id,
          name: device.name,
          status: device.status,
          thisDevice: false,
          lastHeartbeat: device.lastHeartbeat || null,
          platform: device.platform || null,
          repos: summarizeDeviceRepos(device.repos),
        }));
      return {
        configured: true,
        devices: listed,
        note:
          listed.length === 0
            ? 'No synced desktops yet. Use computer_id "local" with a cloud harness, or wait for a desktop heartbeat.'
            : null,
      };
    } catch (err) {
      return { configured: true, devices: [], error: err?.message || 'Failed to list devices' };
    }
  }

  async function executeTool(toolCall, cards = null) {
    const { tool, args } = toolCall;

    switch (tool) {
      case 'list_computers':
        return await listComputers(cards);
      case 'list_repos':
        return await listRepos(args?.computer_id, cards);
      case 'list_tasks':
        return await listTasks(args || {}, cards);
      case 'show_task':
        return await showTask(args?.task_id, cards);
      case 'start_task':
        return await startTask(args, cards);
      case 'show_device':
        return await showDevice(args?.computer_id, cards);
      case 'show_repo':
        return await showRepo(args || {}, cards);
      case 'list_github_repos':
        return await listGithubRepos(args || {}, cards);
      case 'create_local_repo':
        return localGitUnavailable('create_local_repo');
      case 'create_github_repo':
        return await createGithubRepo(args || {}, cards);
      case 'pull_repo':
        return localGitUnavailable('pull_repo');
      case 'list_pull_requests':
        return await listPullRequests(args || {}, cards);
      case 'show_pull_request':
        return await showPullRequest(args || {}, cards);
      case 'merge_pull_request':
        return await mergePullRequest(args || {}, cards);
      case 'close_pull_request':
        return await closePullRequest(args || {}, cards);
      case 'mark_pr_ready':
        return await markPrReady(args || {}, cards);
      default:
        return { error: `Unknown tool: ${tool}` };
    }
  }

  async function listComputers(cards = null) {
    const loaded = await loadDevices();
    if (loaded.error && loaded.devices.length === 0) {
      return { error: loaded.error };
    }
    surfaceCards(cards, loaded.devices, (device) => deviceCard(device));
    if (!loaded.configured || loaded.note) {
      return { computers: loaded.devices, note: loaded.note };
    }
    return loaded.devices;
  }

  async function listRepos(computerId, cards = null) {
    if (isBrowserComputerId(computerId)) {
      return {
        error:
          'This browser has no local repositories. Use list_computers() for synced devices or list_github_repos() for GitHub remotes.',
      };
    }
    const loaded = await loadDevices();
    if (loaded.error && loaded.devices.length === 0) {
      return { error: loaded.error };
    }
    const device = loaded.devices.find((entry) => entry.id === computerId);
    if (!device) return { error: 'Computer not found' };
    const repos = Array.isArray(device.repos) ? device.repos : [];
    const normalized = repos.map((repo) =>
      typeof repo === 'string' ? { name: repo, path: repo } : repo
    );
    surfaceCards(cards, normalized, (repo) => localRepoCard(repo, device));
    return normalized;
  }

  async function listTasks(args = {}, cards = null) {
    if (!listTasksCallback) {
      return { error: 'Task listing is not available in this runtime.' };
    }
    try {
      const agents = await loadTasks();
      const list = Array.isArray(agents) ? agents : [];
      const provider = args.provider ? String(args.provider).toLowerCase() : null;
      const repo = args.repo ? String(args.repo).toLowerCase() : null;
      const status = args.status ? String(args.status).toLowerCase() : null;
      const limit =
        Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 25;

      const filtered = sortTasksForListing(
        list.filter((task) => {
          if (provider && String(task.provider || '').toLowerCase() !== provider) return false;
          if (
            repo &&
            !String(task.repository || '')
              .toLowerCase()
              .includes(repo)
          )
            return false;
          if (status && String(task.status || '').toLowerCase() !== status) return false;
          return true;
        })
      ).slice(0, limit);

      surfaceCards(cards, filtered, (task) => cardFor(task));

      return filtered.map((task) => ({
        id: task.id,
        provider: task.provider,
        name: task.name,
        status: task.status,
        repository: task.repository || null,
        branch: task.branch || null,
        updatedAt: task.updatedAt || null,
        summary: task.summary || null,
      }));
    } catch (err) {
      return { error: err?.message || 'Failed to list tasks' };
    }
  }

  async function showTask(taskId, cards = null) {
    if (!listTasksCallback) {
      return { error: 'Task listing is not available in this runtime.' };
    }
    if (!taskId) {
      return { error: 'task_id is required' };
    }
    try {
      const agents = await loadTasks();
      const list = Array.isArray(agents) ? agents : [];
      const match = list.find((task) => task.id === taskId || task.rawId === taskId);
      if (!match) {
        return { error: `Task not found: ${taskId}` };
      }
      const card = cardFor(match);
      pushCard(cards, card);
      return {
        id: match.id,
        provider: match.provider,
        name: match.name,
        status: match.status,
        repository: match.repository || null,
        branch: match.branch || null,
        prompt: match.prompt || null,
        summary: match.summary || null,
        updatedAt: match.updatedAt || null,
      };
    } catch (err) {
      return { error: err?.message || 'Failed to show task' };
    }
  }

  async function startTask(args, cards = null) {
    if (!createTaskCallback) {
      return { error: 'Task execution not available (callback not set)' };
    }

    const provider = args?.provider || 'jules';
    const computerId = args?.computer_id;
    if (isBrowserComputerId(computerId) && !CLOUD_PROVIDERS.has(provider)) {
      return {
        error: `${provider} tasks need a synced desktop. Call list_computers() and pass that device id.`,
      };
    }

    try {
      const options = {
        prompt: args.task_description,
        projectPath: args.repo_path,
        repository: args.repo_path,
        source: args.repo_path,
        targetDeviceId: isBrowserComputerId(computerId) ? null : computerId,
      };

      const result = await createTaskCallback({
        provider,
        options,
      });

      if (result?.success) {
        taskListPromise = null;
        pushCard(cards, cardFor(result.task));
        return { success: true, task: result.task };
      }
      return { error: result?.error || 'Failed to start task' };
    } catch (err) {
      return { error: err?.message || 'Failed to start task' };
    }
  }

  async function showDevice(computerId, cards = null) {
    if (isBrowserComputerId(computerId)) {
      return {
        error:
          'This browser is not a compute device. Use list_computers() for synced desktops, or start a cloud task with computer_id "local".',
      };
    }
    const loaded = await loadDevices();
    if (loaded.error && loaded.devices.length === 0) return { error: loaded.error };
    const match = loaded.devices.find((device) => device.id === computerId);
    if (!match) return { error: `Device not found: ${computerId}` };
    pushCard(cards, deviceCard(match));
    return match;
  }

  async function showRepo(args = {}, cards = null) {
    if (args.owner && args.repo) {
      const blocked = requireGithub();
      if (blocked) return blocked;
      try {
        const repos = unwrapGithub(await github.getRepos(), 'repos');
        if (repos?.error) return repos;
        const fullName = `${args.owner}/${args.repo}`.toLowerCase();
        const match = (Array.isArray(repos) ? repos : []).find((repo) => {
          const name = String(repo.full_name || `${repo.owner?.login}/${repo.name}`).toLowerCase();
          return name === fullName;
        });
        if (!match) return { error: `GitHub repository not found: ${args.owner}/${args.repo}` };
        const card = githubRepoCard(match);
        pushCard(cards, card);
        return card;
      } catch (err) {
        return { error: err?.message || 'Failed to show repository' };
      }
    }

    const repos = await listRepos(args.computer_id);
    if (repos?.error) return repos;
    const needle = String(args.repo_path || args.repo || '').toLowerCase();
    if (!needle) return { error: 'repo_path or owner+repo is required' };
    const match = (Array.isArray(repos) ? repos : []).find((repo) => {
      const path = String(repo.path || repo.id || '').toLowerCase();
      const name = String(repo.name || repo.displayName || '').toLowerCase();
      return path === needle || path.endsWith(needle) || name === needle;
    });
    if (!match) return { error: `Repository not found: ${args.repo_path || args.repo}` };
    const computer = { id: args.computer_id, name: null };
    const card = localRepoCard(match, computer);
    pushCard(cards, card);
    return card;
  }

  async function listGithubRepos(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const repos = unwrapGithub(await github.getRepos(), 'repos');
      if (repos?.error) return repos;
      const limit =
        Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 25;
      const sliced = (Array.isArray(repos) ? repos : []).slice(0, limit);
      surfaceCards(cards, sliced, (repo) => githubRepoCard(repo));
      return sliced.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        private: !!repo.private,
        defaultBranch: repo.default_branch || null,
        updatedAt: repo.updated_at || null,
      }));
    } catch (err) {
      return { error: err?.message || 'Failed to list GitHub repos' };
    }
  }

  async function createGithubRepo(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const envelope = await github.createRepo({
        name: args.name,
        private: !!args.private,
        owner: args.owner,
        ownerType: args.owner_type || 'user',
      });
      if (!envelope?.success) {
        return { error: envelope?.error || 'Failed to create GitHub repository' };
      }
      const card = githubRepoCard(envelope.repo);
      pushCard(cards, card);
      return { success: true, repo: card };
    } catch (err) {
      return { error: err?.message || 'Failed to create GitHub repository' };
    }
  }

  async function listPullRequests(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const limit =
        Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : 20;
      const state = args.state || 'open';
      let prs;
      if (args.owner && args.repo) {
        prs = unwrapGithub(await github.getPrs(args.owner, args.repo, state), 'prs');
      } else {
        prs = unwrapGithub(await github.getAllPrs(), 'prs');
        if (!prs?.error && state !== 'all') {
          prs = (Array.isArray(prs) ? prs : []).filter(
            (pr) => String(pr.state || 'open') === state
          );
        }
      }
      if (prs?.error) return prs;
      const sliced = (Array.isArray(prs) ? prs : []).slice(0, limit);
      surfaceCards(cards, sliced, (pr) => prCard(pr));
      return sliced.map((pr) => summarizePr(pr)).filter(Boolean);
    } catch (err) {
      return { error: err?.message || 'Failed to list pull requests' };
    }
  }

  async function showPullRequest(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    if (!args.owner || !args.repo || args.pr_number == null) {
      return { error: 'owner, repo, and pr_number are required' };
    }
    try {
      const pr = unwrapGithub(
        await github.getPrDetails(args.owner, args.repo, args.pr_number),
        'pr'
      );
      if (pr?.error) return pr;
      const card = prCard(pr);
      pushCard(cards, card);
      return summarizePr(pr);
    } catch (err) {
      return { error: err?.message || 'Failed to show pull request' };
    }
  }

  async function mergePullRequest(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const envelope = await github.mergePr(
        args.owner,
        args.repo,
        args.pr_number,
        args.method || 'merge'
      );
      if (!envelope?.success) {
        return { error: envelope?.error || 'Failed to merge pull request' };
      }
      await showPullRequest(args, cards);
      return { success: true, result: envelope.result };
    } catch (err) {
      return { error: err?.message || 'Failed to merge pull request' };
    }
  }

  async function closePullRequest(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const envelope = await github.closePr(args.owner, args.repo, args.pr_number);
      if (!envelope?.success) {
        return { error: envelope?.error || 'Failed to close pull request' };
      }
      await showPullRequest(args, cards);
      return { success: true, result: envelope.result };
    } catch (err) {
      return { error: err?.message || 'Failed to close pull request' };
    }
  }

  async function markPrReady(args = {}, cards = null) {
    const blocked = requireGithub();
    if (blocked) return blocked;
    try {
      const pr = unwrapGithub(
        await github.getPrDetails(args.owner, args.repo, args.pr_number),
        'pr'
      );
      if (pr?.error) return pr;
      if (!pr?.node_id) return { error: 'Could not resolve pull request node id.' };
      const envelope = await github.markPrReadyForReview(pr.node_id);
      if (!envelope?.success) {
        return { error: envelope?.error || 'Failed to mark ready for review' };
      }
      pushCard(cards, prCard({ ...pr, draft: false }));
      return { success: true };
    } catch (err) {
      return { error: err?.message || 'Failed to mark ready for review' };
    }
  }

  return {
    getAvailableModels,
    chat,
    executeTool,
    setCreateTaskCallback,
    setListTasksCallback,
  };
}

export default createAgentOrchestratorService;
