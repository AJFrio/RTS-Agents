/**
 * Central registry for agent discovery, repos, task creation, and follow-ups.
 * Used by IPC handlers in register-agents.js and register-tasks.js.
 */

const projectService = require('../services/project-service');
const acpService = require('../services/acp-service');

const REMOTE_TASK_PROVIDERS = new Set(['antigravity', 'claude-cli', 'codex', 'opencode']);
const LOCAL_CWD_PROVIDERS = new Set(['antigravity', 'codex', 'claude-cli', 'opencode', 'cursor']);

const AGENT_LIST_KEYS = [
  'antigravity',
  'jules',
  'cursor',
  'codex',
  'claude-cli',
  'claude-cloud',
  'opencode',
];

const REPO_LIST_KEYS = [
  'jules',
  'cursor',
  'antigravity',
  'codex',
  'claude-cli',
  'claude-cloud',
  'opencode',
];

function emptyAgentResults() {
  const results = { errors: [] };
  for (const key of AGENT_LIST_KEYS) {
    results[key] = [];
  }
  return results;
}

function emptyRepoResults() {
  const results = { errors: [] };
  for (const key of REPO_LIST_KEYS) {
    results[key] = [];
  }
  return results;
}

function sortAgentsByDate(agents) {
  return [...agents].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0);
    const dateB = new Date(b.updatedAt || b.createdAt || 0);
    return dateB - dateA;
  });
}

function applySettledAgentResult(results, key, settled, shouldReportError) {
  if (settled.status === 'fulfilled') {
    let value = settled.value || [];
    if (key === 'claude-cli' || key === 'claude-cloud' || key === 'opencode') {
      value = value.map((agent) => ({ ...agent, provider: key }));
    }
    results[key] = value;
  } else if (shouldReportError) {
    results.errors.push({
      provider: key,
      error: settled.reason?.message || 'Unknown error',
    });
  }
}

async function fetchAllAgents(deps) {
  const {
    configStore,
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    opencodeService,
  } = deps;

  const results = emptyAgentResults();
  const allProjectPaths = configStore.getAllProjectPaths();
  const [antigravityAvailable, claudeCliAvailable, opencodeAvailable, cursorCliSessions] =
    await Promise.all([
      antigravityService.isAntigravityInstalled(),
      claudeService.isClaudeInstalled(),
      opencodeService.isOpenCodeInstalled(),
      Promise.resolve(cursorService.getCursorCliSessions()),
    ]);
  const codexAvailable = configStore.hasApiKey('codex') || (await codexService.isCodexInstalled());
  const claudeCloudAvailable = configStore.hasApiKey('claude');
  const cursorAvailable =
    configStore.hasApiKey('cursor') ||
    cursorCliSessions.length > 0 ||
    cursorService.isCursorCliAvailable();

  const settled = await Promise.allSettled([
    antigravityAvailable ? Promise.resolve(antigravityService.getAllAgents()) : Promise.resolve([]),
    configStore.hasApiKey('jules') ? julesService.getAllAgents() : Promise.resolve([]),
    cursorAvailable ? cursorService.getAllAgents() : Promise.resolve([]),
    codexAvailable ? Promise.resolve(codexService.getAllAgents()) : Promise.resolve([]),
    claudeCliAvailable ? claudeService.getAllLocalSessions(allProjectPaths) : Promise.resolve([]),
    claudeCloudAvailable ? claudeService.getAllCloudConversations() : Promise.resolve([]),
    opencodeAvailable ? Promise.resolve(opencodeService.getAllAgents()) : Promise.resolve([]),
  ]);

  const reportFlags = [
    antigravityAvailable,
    configStore.hasApiKey('jules'),
    cursorAvailable,
    codexAvailable,
    claudeCliAvailable,
    claudeCloudAvailable,
    opencodeAvailable,
  ];

  settled.forEach((entry, index) => {
    applySettledAgentResult(results, AGENT_LIST_KEYS[index], entry, reportFlags[index]);
  });

  const allAgents = sortAgentsByDate(AGENT_LIST_KEYS.flatMap((key) => results[key]));

  const counts = { total: allAgents.length };
  for (const key of AGENT_LIST_KEYS) {
    counts[key] = results[key].length;
  }

  return { agents: allAgents, errors: results.errors, counts };
}

async function getAgentDetails(deps, { provider, rawId, filePath }) {
  const {
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    opencodeService,
  } = deps;

  switch (provider) {
    case 'antigravity':
      return antigravityService.getSessionDetails(rawId);
    case 'jules':
      return julesService.getAgentDetailsText(rawId);
    case 'cursor':
      // Tracked local CLI ids ('cursor-cli-…') are resolved inside the
      // service; cloud ids keep their 'cursor-' prefix strip there too.
      return cursorService.getAgentDetails(rawId);
    case 'codex':
      return codexService.getAgentDetails(rawId);
    case 'claude':
    case 'claude-cli':
    case 'claude-cloud':
      return claudeService.getAgentDetails(rawId, filePath);
    case 'opencode':
      return opencodeService.getSessionDetails(rawId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function fetchRepositories(deps, provider) {
  const {
    configStore,
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    opencodeService,
  } = deps;

  switch (provider) {
    case 'jules': {
      if (!configStore.hasApiKey('jules')) {
        return { success: false, error: 'Jules API key not configured', repositories: [] };
      }
      const repositories = await julesService.getAllSources();
      return { success: true, repositories };
    }
    case 'cursor': {
      if (
        !configStore.hasApiKey('cursor') &&
        configStore.getCursorPaths().length === 0 &&
        !cursorService.isCursorCliAvailable()
      ) {
        return {
          success: false,
          error: 'Cursor API key not configured, Cursor CLI not installed, and no local paths set',
          repositories: [],
        };
      }
      const scanPaths = [
        ...new Set([...configStore.getCursorPaths(), ...configStore.getAllProjectPaths()]),
      ];
      const repositories = await cursorService.getAllRepositories(scanPaths);
      return { success: true, repositories };
    }
    case 'antigravity': {
      if (!(await antigravityService.isAntigravityInstalled())) {
        return { success: false, error: 'Antigravity CLI not installed', repositories: [] };
      }
      const repositories = await antigravityService.getAvailableProjects(
        configStore.getAllProjectPaths()
      );
      return { success: true, repositories };
    }
    case 'codex': {
      if (
        !configStore.hasApiKey('codex') &&
        configStore.getCodexPaths().length === 0 &&
        !(await codexService.isCodexInstalled())
      ) {
        return {
          success: false,
          error: 'OpenAI API key not configured, Codex CLI not installed, and no local paths set',
          repositories: [],
        };
      }
      const repositories = await codexService.getAvailableProjects(
        configStore.getAllProjectPaths()
      );
      return { success: true, repositories };
    }
    case 'claude-cli': {
      if (!(await claudeService.isClaudeInstalled())) {
        return { success: false, error: 'Claude CLI not installed', repositories: [] };
      }
      const repositories = await claudeService.getAvailableProjects(
        configStore.getAllProjectPaths()
      );
      return { success: true, repositories };
    }
    case 'opencode': {
      if (!(await opencodeService.isOpenCodeInstalled())) {
        return { success: false, error: 'OpenCode CLI not installed', repositories: [] };
      }
      const repositories = await opencodeService.getAvailableProjects(
        configStore.getAllProjectPaths()
      );
      return { success: true, repositories };
    }
    case 'claude-cloud': {
      if (!configStore.hasApiKey('claude')) {
        return { success: false, error: 'Claude API key not configured', repositories: [] };
      }
      return { success: true, repositories: [] };
    }
    default:
      return { success: false, error: `Unknown provider: ${provider}`, repositories: [] };
  }
}

async function fetchAllRepositories(deps) {
  const {
    configStore,
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    opencodeService,
  } = deps;

  const results = emptyRepoResults();
  const allProjectPaths = configStore.getAllProjectPaths();
  const [antigravityAvailable, claudeCliAvailable, opencodeAvailable] = await Promise.all([
    antigravityService.isAntigravityInstalled(),
    claudeService.isClaudeInstalled(),
    opencodeService.isOpenCodeInstalled(),
  ]);
  const codexAvailable =
    configStore.hasApiKey('codex') ||
    configStore.getCodexPaths().length > 0 ||
    (await codexService.isCodexInstalled());
  const cursorPaths = configStore.getCursorPaths();

  const settled = await Promise.allSettled([
    configStore.hasApiKey('jules') ? julesService.getAllSources() : Promise.resolve([]),
    configStore.hasApiKey('cursor') || cursorPaths.length > 0
      ? cursorService.getAllRepositories(cursorPaths)
      : Promise.resolve([]),
    antigravityAvailable
      ? antigravityService.getAvailableProjects(allProjectPaths)
      : Promise.resolve([]),
    codexAvailable ? codexService.getAvailableProjects(allProjectPaths) : Promise.resolve([]),
    claudeCliAvailable ? claudeService.getAvailableProjects(allProjectPaths) : Promise.resolve([]),
    opencodeAvailable ? opencodeService.getAvailableProjects(allProjectPaths) : Promise.resolve([]),
  ]);

  const repoKeys = ['jules', 'cursor', 'antigravity', 'codex', 'claude-cli', 'opencode'];
  const reportFlags = [
    configStore.hasApiKey('jules'),
    configStore.hasApiKey('cursor'),
    antigravityAvailable,
    codexAvailable,
    claudeCliAvailable,
    opencodeAvailable,
  ];

  settled.forEach((entry, index) => {
    const key = repoKeys[index];
    if (entry.status === 'fulfilled') {
      results[key] = entry.value;
    } else if (reportFlags[index]) {
      results.errors.push({ provider: key, error: entry.reason?.message || 'Unknown error' });
    }
  });

  results['claude-cloud'] = [];
  return results;
}

async function resolveTaskProjectPath(configStore, options) {
  const raw = options?.projectPath || options?.repository;
  if (!raw) {
    return options;
  }
  const resolved = await projectService.resolveLocalProjectPath(
    raw,
    configStore.getAllProjectPaths()
  );
  if (resolved === raw) {
    return options;
  }
  return { ...options, projectPath: resolved, repository: resolved };
}

async function createLocalTask(deps, provider, options) {
  const {
    configStore,
    antigravityService,
    julesService,
    cursorService,
    codexService,
    claudeService,
    opencodeService,
  } = deps;

  switch (provider) {
    case 'jules': {
      if (!configStore.hasApiKey('jules')) {
        throw new Error('Jules API key not configured');
      }
      const julesOptions = { ...options, source: options.source || options.repository };
      const task = await julesService.createSession(julesOptions);
      return { success: true, task };
    }
    case 'cursor': {
      // Local CLI dispatch wins when a project path and the Cursor agent CLI
      // are available; the cloud API remains the path for repo-less tasks.
      const cursorAdapter = options.projectPath ? acpService.resolveAdapter('cursor') : null;
      if (cursorAdapter) {
        const task = await cursorService.startCliSession(options);
        return { success: true, task: { ...task, provider: 'cursor' } };
      }
      if (!configStore.hasApiKey('cursor')) {
        throw new Error('Cursor API key not configured and Cursor CLI not installed');
      }
      const task = await cursorService.createAgent(options);
      return { success: true, task };
    }
    case 'antigravity': {
      if (!(await antigravityService.isAntigravityInstalled())) {
        throw new Error('Antigravity CLI not installed');
      }
      const task = await antigravityService.startSession(options);
      return { success: true, task };
    }
    case 'codex': {
      if (!configStore.hasApiKey('codex') && !(await codexService.isCodexInstalled())) {
        throw new Error('OpenAI API key not configured and Codex CLI not installed');
      }
      const task = await codexService.createTask(options);
      configStore.setCodexThreads(codexService.getTrackedThreads());
      return { success: true, task };
    }
    case 'claude-cli': {
      if (!(await claudeService.isClaudeInstalled())) {
        throw new Error('Claude CLI not installed');
      }
      const task = await claudeService.startLocalSession(options);
      return { success: true, task: { ...task, provider: 'claude-cli' } };
    }
    case 'opencode': {
      if (!(await opencodeService.isOpenCodeInstalled())) {
        throw new Error('OpenCode CLI not installed or not on PATH');
      }
      const task = await opencodeService.startSession(options);
      return { success: true, task: { ...task, provider: 'opencode' } };
    }
    case 'claude-cloud': {
      if (!configStore.hasApiKey('claude')) {
        throw new Error('Claude API key not configured');
      }
      const cloudOptions = { ...options, projectPath: null };
      const task = await claudeService.createTask(cloudOptions);
      configStore.setClaudeConversations(claudeService.getTrackedConversations());
      return { success: true, task: { ...task, provider: 'claude-cloud' } };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function createRemoteTask(deps, provider, options) {
  const { configStore, cloudflareKvService, lifecycle } = deps;
  const ensureCloudflareNamespaceId = lifecycle.ensureCloudflareNamespaceId;

  if (!REMOTE_TASK_PROVIDERS.has(provider)) {
    throw new Error(
      `Remote execution is not supported for ${provider}. Use Antigravity, OpenCode, Claude CLI, or Codex on a registered device.`
    );
  }

  const namespaceId = await ensureCloudflareNamespaceId();
  if (!namespaceId) throw new Error('Cloudflare KV not configured');

  const repoPath = options.projectPath || options.repository;
  if (!repoPath) throw new Error('Repository path is required for remote tasks');

  const identity = configStore.getOrCreateDeviceIdentity();
  const nowIso = new Date().toISOString();
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tool: provider,
    repo: { path: repoPath },
    prompt: options.prompt,
    attachments: options.attachments,
    model: options.model || null,
    requestedBy: identity.name,
    createdAt: nowIso,
  };

  await cloudflareKvService.enqueueDeviceTask(namespaceId, options.targetDeviceId, task);

  return {
    success: true,
    task: {
      ...task,
      status: 'queued',
      provider,
      name: `Remote ${provider} task`,
      summary: 'Queued on remote device',
    },
  };
}

async function createTask(deps, { provider, options }) {
  try {
    let taskOptions = options;
    if (LOCAL_CWD_PROVIDERS.has(provider)) {
      taskOptions = await resolveTaskProjectPath(deps.configStore, options);
    }
    if (taskOptions?.targetDeviceId) {
      return await createRemoteTask(deps, provider, taskOptions);
    }
    return await createLocalTask(deps, provider, taskOptions);
  } catch (err) {
    console.error(`Error creating task for ${provider}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Local CLI providers that hold a live ACP adapter open between turns, and
 * can resume a prior conversation via session/load after a restart.
 */
function acpFollowUpService(deps, provider) {
  switch (provider) {
    case 'claude-cli':
      return deps.claudeService;
    case 'codex':
      return deps.codexService;
    case 'opencode':
      return deps.opencodeService;
    default:
      return null;
  }
}

async function sendTaskMessage(deps, { provider, rawId, message, filePath }) {
  const { configStore, julesService, cursorService } = deps;

  // A follow-up continues the same conversation rather than starting a new
  // one. If the adapter is gone the service resumes it via session/load, and
  // reports a clear error when neither is possible.
  const acpService_ = acpFollowUpService(deps, provider);
  if (acpService_) {
    // filePath lets Claude resume sessions discovered on disk, which have no
    // tracked record but are still loadable by session id.
    await acpService_.sendFollowUp(rawId, message, filePath);
    return { success: true };
  }

  switch (provider) {
    case 'jules': {
      if (!configStore.hasApiKey('jules')) {
        throw new Error('Jules API key not configured');
      }
      await julesService.sendMessage(rawId, message);
      return { success: true };
    }
    case 'cursor': {
      // Cursor CLI tasks run over ACP locally; cloud agents use the REST API.
      if (cursorService.supportsFollowUp?.(rawId)) {
        await cursorService.sendFollowUp(rawId, message);
        return { success: true };
      }
      if (!configStore.hasApiKey('cursor')) {
        throw new Error('Cursor API key not configured');
      }
      await cursorService.addFollowUp(rawId, message);
      return { success: true };
    }
    default:
      throw new Error(`Provider ${provider} does not support follow-up messages`);
  }
}

/**
 * Point-in-time check for whether a task can accept a follow-up message.
 *
 * Remote providers can always take one (the conversation lives server-side).
 * Local CLI providers need a live ACP adapter, which is lost on restart,
 * crash, or idle reaping.
 */
function canSendTaskMessage(deps, { provider, rawId, filePath }) {
  const { configStore, cursorService } = deps;

  const acpService_ = acpFollowUpService(deps, provider);
  if (acpService_) {
    return Boolean(acpService_.supportsFollowUp?.(rawId, filePath));
  }

  switch (provider) {
    case 'jules':
      return configStore.hasApiKey('jules');
    case 'cursor':
      // Either a local ACP session we can continue, or a cloud agent.
      return (
        Boolean(cursorService?.supportsFollowUp?.(rawId)) || configStore.hasApiKey('cursor')
      );
    default:
      return false;
  }
}

module.exports = {
  AGENT_LIST_KEYS,
  REPO_LIST_KEYS,
  REMOTE_TASK_PROVIDERS,
  fetchAllAgents,
  getAgentDetails,
  fetchRepositories,
  fetchAllRepositories,
  createTask,
  sendTaskMessage,
  canSendTaskMessage,
  sortAgentsByDate,
};
