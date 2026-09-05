export const VIEWS = [
  'agent',
  'new-task',
  'plugins',
  'devices',
  'dashboard',
  'branches',
  'pull-requests',
  'jira',
  'settings',
  'task-detail',
];

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MAX_FRACTION = 1 / 3;

export function sidebarMaxWidth() {
  if (typeof window === 'undefined') return 480;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth * SIDEBAR_MAX_FRACTION));
}

const PR_HIDDEN_REPOS_STORAGE_KEY = 'rts_pr_hidden_repos_v1';
const SIDEBAR_WIDTH_STORAGE_KEY = 'rts_sidebar_width_v1';
const SIDEBAR_MODE_STORAGE_KEY = 'rts_sidebar_mode_v1';

function getStoredSidebarWidth() {
  try {
    if (typeof localStorage === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(raw)) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(Math.max(raw, SIDEBAR_MIN_WIDTH), sidebarMaxWidth());
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function getStoredSidebarMode() {
  try {
    if (typeof localStorage === 'undefined') return 'repos';
    const raw = localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    return raw === 'agents' ? 'agents' : 'repos';
  } catch {
    return 'repos';
  }
}

function getStoredPrHiddenRepos() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const parsed = JSON.parse(localStorage.getItem(PR_HIDDEN_REPOS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((repo) => typeof repo === 'string') : [];
  } catch {
    return [];
  }
}

function setStoredPrHiddenRepos(repos) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PR_HIDDEN_REPOS_STORAGE_KEY, JSON.stringify(repos));
    }
  } catch {
    // Ignore storage failures; the in-memory filter still applies for this session.
  }
}

export function taskMatches(selected, agent) {
  if (!selected || !agent) return false;
  if (selected.id && selected.id === agent.id) return true;
  if (selected.rawId && (selected.rawId === agent.rawId || selected.rawId === agent.id)) {
    return true;
  }
  if (agent.rawId && selected.id === agent.rawId) return true;
  return false;
}

export function syncSelectedTask(selectedTask, agents) {
  if (!selectedTask || !Array.isArray(agents)) return selectedTask;
  const match = agents.find((agent) => taskMatches(selectedTask, agent));
  return match || selectedTask;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped']);

/**
 * Pick the best-known status from details, the live list row, and the
 * selected-task snapshot. A terminal status from any source wins so the
 * chat and list do not disagree after a turn ends.
 */
export function resolveTaskStatus(...sources) {
  const values = sources.filter((status) => status != null && String(status).trim() !== '');
  const terminal = values.find((status) => TERMINAL_STATUSES.has(String(status).toLowerCase()));
  return terminal || values[0] || null;
}

/**
 * Keep a newer terminal status when a stale discovery snapshot still says
 * running (in-flight list fetches can land after a live session ends).
 */
export function reconcileAgentAgainstKnown(prev, next) {
  if (!prev || !next) return next;
  const prevStatus = String(prev.status || '').toLowerCase();
  const nextStatus = String(next.status || '').toLowerCase();
  if (TERMINAL_STATUSES.has(prevStatus) && nextStatus === 'running') {
    const prevTime = new Date(prev.updatedAt || 0).getTime();
    const nextTime = new Date(next.updatedAt || 0).getTime();
    if (!Number.isFinite(nextTime) || prevTime >= nextTime) {
      return { ...next, status: prev.status, updatedAt: prev.updatedAt };
    }
  }
  return next;
}

function mergeIncomingAgents(previous, incoming) {
  if (!Array.isArray(incoming)) return incoming;
  const prevList = Array.isArray(previous) ? previous : [];
  if (prevList.length === 0) return incoming;
  return incoming.map((agent) => {
    const prev = prevList.find((item) => taskMatches(item, agent) || taskMatches(agent, item));
    return reconcileAgentAgainstKnown(prev, agent);
  });
}

/**
 * Insert or merge a task into the agent list. Sparse patches do not wipe
 * existing ids; a no-op returns the same array reference.
 */
export function upsertAgent(agents, incoming) {
  if (!incoming || (!incoming.id && !incoming.rawId)) {
    return Array.isArray(agents) ? agents : [];
  }
  const list = Array.isArray(agents) ? agents : [];
  const idx = list.findIndex((agent) => taskMatches(incoming, agent) || taskMatches(agent, incoming));
  if (idx === -1) {
    const created = {
      ...incoming,
      id: incoming.id || incoming.rawId,
      rawId: incoming.rawId || incoming.id,
    };
    return [created, ...list];
  }

  const prev = list[idx];
  const next = { ...prev };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || key === 'id' || key === 'rawId') continue;
    next[key] = value;
  }
  if (!next.id) next.id = prev.id || incoming.id || incoming.rawId;
  if (!next.rawId) next.rawId = prev.rawId || incoming.rawId || incoming.id;

  const changed = Object.keys(next).some((key) => next[key] !== prev[key]);
  if (!changed) return list;
  const copy = [...list];
  copy[idx] = next;
  return copy;
}

/**
 * Normalize `tasks:create` IPC / web-hub results into a list/detail task.
 */
export function normalizeCreatedTask(provider, result) {
  if (!result || result.success === false) return null;
  const task = result.task && typeof result.task === 'object' ? result.task : null;
  if (!task) return null;
  const id = task.id || task.rawId;
  if (!id) return null;
  const prompt = typeof task.prompt === 'string' ? task.prompt : '';
  return {
    ...task,
    id,
    rawId: task.rawId || task.id || id,
    provider: task.provider || provider,
    status: task.status || 'running',
    name:
      task.name ||
      (prompt ? `${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}` : 'Task'),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
  };
}

export const initialState = {
  currentView: 'agent',
  previousView: null,
  agents: [],
  agentListRevision: 0,
  filteredAgents: [],
  filters: {
    providers: {
      antigravity: true,
      jules: true,
      cursor: true,
      codex: true,
      'claude-cli': true,
      'claude-cloud': true,
      opencode: true,
    },
    statuses: {
      running: true,
      completed: true,
      pending: true,
      failed: true,
      stopped: true,
    },
    search: '',
  },
  settings: {
    pollingInterval: 30000,
    autoPolling: true,
    antigravityPaths: [],
    claudePaths: [],
    cursorPaths: [],
    codexPaths: [],
    opencodePaths: [],
    githubPaths: [],
    theme: 'system',
    displayMode: 'fullscreen',
    jiraBaseUrl: '',
    selectedModel: 'openrouter/openai/gpt-4o',
  },
  counts: {
    antigravity: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    opencode: 0,
    total: 0,
  },
  configuredServices: {
    antigravity: false,
    jules: false,
    cursor: false,
    codex: false,
    'claude-cli': false,
    'claude-cloud': false,
    opencode: false,
    openrouter: false,
    github: false,
    jira: false,
  },
  capabilities: {
    antigravity: { cloud: false, local: false },
    jules: { cloud: false, local: false },
    cursor: { cloud: false, local: false },
    codex: { cloud: false, local: false },
    claude: { cloud: false, local: false },
    opencode: { cloud: false, local: false },
    github: { cloud: false, local: false },
  },
  serviceInfo: {
    apiKeys: {},
    cloudflare: {
      configured: false,
      accountId: '',
      namespaceTitle: 'rtsa',
    },
    installations: {
      antigravity: false,
      claude: false,
      codex: false,
      opencode: false,
    },
  },
  connectionStatus: {},
  loading: false,
  refreshing: false,
  errors: [],
  pagination: {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
  },
  newTask: {
    initialPrompt: '',
    selectedService: null,
    environment: 'local',
    targetDevice: 'local',
    repositories: [],
    loadingRepos: false,
    creating: false,
    promptMode: 'write',
    pastedImages: [],
    presetEnvironment: null,
    presetTargetDeviceId: null,
    presetPreferredProvider: null,
  },
  remoteQueue: {
    loading: false,
    devices: [],
    configured: false,
    updatedAt: null,
    lastError: null,
  },
  createRepo: {
    open: false,
    location: 'github',
    name: '',
    githubOwner: '',
    githubPrivate: false,
    localDir: '',
    remoteDeviceId: '',
    loading: false,
  },
  github: {
    repos: [],
    localRepos: [],
    filteredRepos: [],
    selectedRepo: null,
    prs: [],
    allPrs: [],
    loadingRepos: false,
    loadingPrs: false,
    loadingAllPrs: false,
    allPrsError: null,
    currentPr: null,
    prFilter: 'open',
    hiddenPrRepos: getStoredPrHiddenRepos(),
    prRepoFilterOpen: false,
  },
  computers: {
    list: [],
    loading: false,
    configured: false,
  },
  jira: {
    boards: [],
    issues: [],
    selectedBoardId: null,
    selectedAssignee: null,
    loading: false,
    error: null,
  },
  localDeviceId: null,
  orchestratorChat: {
    messages: [],
    input: '',
    busy: false,
    recentTasksVisible: true,
  },
  selectedTask: null,
  focusedDeviceId: null,
  sidebarWidth: getStoredSidebarWidth(),
  sidebarMode: getStoredSidebarMode(),
  newTaskModalOpen: false,
  createRepoModalOpen: false,
  prModal: null,
  confirmModal: null,
  jiraIssueModal: null,
  pastedImageModal: null,
};

export function appReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_FOCUSED_DEVICE':
      return { ...state, focusedDeviceId: action.payload || null };
    case 'OPEN_TASK': {
      const fromView = state.currentView;
      const previousView =
        fromView && fromView !== 'task-detail'
          ? fromView
          : state.previousView || 'agent';
      return {
        ...state,
        selectedTask: action.payload,
        currentView: 'task-detail',
        previousView,
        newTaskModalOpen: false,
      };
    }
    case 'UPSERT_AGENT': {
      const agents = upsertAgent(state.agents, action.payload);
      if (agents === state.agents) return state;
      return {
        ...state,
        agents,
        selectedTask: syncSelectedTask(state.selectedTask, agents),
      };
    }
    case 'CLOSE_TASK': {
      const prev = state.previousView;
      const nextView =
        typeof prev === 'string' && prev !== 'task-detail' && VIEWS.includes(prev)
          ? prev
          : 'agent';
      return { ...state, selectedTask: null, currentView: nextView, previousView: null };
    }
    case 'SET_SIDEBAR_WIDTH': {
      const width = Math.min(Math.max(action.payload, SIDEBAR_MIN_WIDTH), sidebarMaxWidth());
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
        }
      } catch {
        // Ignore storage failures; the in-memory width still applies for this session.
      }
      return { ...state, sidebarWidth: width };
    }
    case 'SET_SIDEBAR_MODE': {
      const mode = action.payload === 'agents' ? 'agents' : 'repos';
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, mode);
        }
      } catch {
        // Ignore storage failures; the in-memory mode still applies for this session.
      }
      return { ...state, sidebarMode: mode };
    }
    case 'SET_AGENTS': {
      const agents = mergeIncomingAgents(state.agents, action.payload.agents ?? state.agents);
      return {
        ...state,
        agents,
        agentListRevision: action.payload.revision ?? state.agentListRevision,
        counts: action.payload.counts ?? state.counts,
        errors: action.payload.errors ?? state.errors,
        selectedTask: syncSelectedTask(state.selectedTask, agents),
      };
    }
    case 'MERGE_AGENTS_DELTA': {
      const { added = [], updated = [], removed = [] } = action.payload.delta || {};
      const byId = new Map(state.agents.map((a) => [a.id, a]));
      for (const id of removed) {
        byId.delete(id);
      }
      for (const agent of updated) {
        const prev = byId.get(agent.id) || state.agents.find((item) => taskMatches(item, agent));
        const merged = reconcileAgentAgainstKnown(prev, agent);
        byId.set(merged.id || agent.id, merged);
      }
      for (const agent of added) {
        byId.set(agent.id, agent);
      }
      const agents = [...byId.values()];
      return {
        ...state,
        agents,
        agentListRevision: action.payload.revision ?? state.agentListRevision,
        counts: action.payload.counts ?? state.counts,
        errors: action.payload.errors ?? state.errors,
        selectedTask: syncSelectedTask(state.selectedTask, agents),
      };
    }
    case 'SET_FILTERED_AGENTS':
      return { ...state, filteredAgents: action.payload };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_CONFIGURED_SERVICES':
      return { ...state, configuredServices: { ...state.configuredServices, ...action.payload } };
    case 'SET_CAPABILITIES':
      return { ...state, capabilities: { ...state.capabilities, ...action.payload } };
    case 'SET_SERVICE_INFO':
      return {
        ...state,
        serviceInfo: {
          ...state.serviceInfo,
          ...action.payload,
          apiKeys: action.payload.apiKeys ?? state.serviceInfo.apiKeys,
          cloudflare: action.payload.cloudflare ?? state.serviceInfo.cloudflare,
          installations: action.payload.installations ?? state.serviceInfo.installations,
        },
      };
    case 'SET_COMPUTERS':
      return { ...state, computers: { ...state.computers, ...action.payload } };
    case 'SET_GITHUB':
      return { ...state, github: { ...state.github, ...action.payload } };
    case 'SET_ALL_PRS':
      return {
        ...state,
        github: {
          ...state.github,
          allPrs: action.payload,
          loadingAllPrs: false,
          allPrsError: null,
        },
      };
    case 'SET_ALL_PRS_LOADING':
      return { ...state, github: { ...state.github, loadingAllPrs: action.payload } };
    case 'SET_ALL_PRS_ERROR':
      return {
        ...state,
        github: { ...state.github, loadingAllPrs: false, allPrsError: action.payload },
      };
    case 'SET_PR_HIDDEN_REPOS': {
      const hiddenPrRepos = [...new Set(action.payload || [])].filter(Boolean).sort();
      setStoredPrHiddenRepos(hiddenPrRepos);
      return { ...state, github: { ...state.github, hiddenPrRepos } };
    }
    case 'OPEN_PR_REPO_FILTER':
      return { ...state, github: { ...state.github, prRepoFilterOpen: true } };
    case 'CLOSE_PR_REPO_FILTER':
      return { ...state, github: { ...state.github, prRepoFilterOpen: false } };
    case 'REMOVE_PR':
      return {
        ...state,
        github: {
          ...state.github,
          allPrs: state.github.allPrs.filter((pr) => pr.id !== action.payload),
        },
      };
    case 'SET_JIRA':
      return { ...state, jira: { ...state.jira, ...action.payload } };
    case 'SET_REMOTE_QUEUE':
      return { ...state, remoteQueue: { ...state.remoteQueue, ...action.payload } };
    case 'SET_PAGINATION':
      return { ...state, pagination: { ...state.pagination, ...action.payload } };
    case 'SET_NEW_TASK':
      return { ...state, newTask: { ...state.newTask, ...action.payload } };
    case 'SET_CREATE_REPO':
      return { ...state, createRepo: { ...state.createRepo, ...action.payload } };
    case 'SET_LOCAL_DEVICE_ID':
      return { ...state, localDeviceId: action.payload };
    case 'OPEN_NEW_TASK_MODAL':
      return {
        ...state,
        newTaskModalOpen: true,
        newTask: {
          ...state.newTask,
          newTaskLaunchId: (state.newTask?.newTaskLaunchId || 0) + 1,
          initialPrompt: action.payload?.initialPrompt ?? '',
          presetEnvironment:
            action.payload?.presetEnvironment !== undefined
              ? action.payload.presetEnvironment
              : null,
          presetTargetDeviceId:
            action.payload?.presetTargetDeviceId !== undefined
              ? action.payload.presetTargetDeviceId
              : null,
          presetPreferredProvider:
            action.payload?.presetPreferredProvider !== undefined
              ? action.payload.presetPreferredProvider
              : null,
        },
      };
    case 'CLOSE_NEW_TASK_MODAL':
      return {
        ...state,
        newTaskModalOpen: false,
        newTask: {
          ...state.newTask,
          initialPrompt: '',
          presetEnvironment: null,
          presetTargetDeviceId: null,
          presetPreferredProvider: null,
        },
      };
    case 'OPEN_CREATE_REPO_MODAL':
      return { ...state, createRepoModalOpen: true };
    case 'CLOSE_CREATE_REPO_MODAL':
      return { ...state, createRepoModalOpen: false };
    case 'OPEN_PR_MODAL':
      return { ...state, prModal: action.payload };
    case 'CLOSE_PR_MODAL':
      return { ...state, prModal: null };
    case 'OPEN_CONFIRM_MODAL':
      return { ...state, confirmModal: action.payload };
    case 'CLOSE_CONFIRM_MODAL':
      return { ...state, confirmModal: null };
    case 'OPEN_JIRA_ISSUE_MODAL':
      return { ...state, jiraIssueModal: action.payload };
    case 'CLOSE_JIRA_ISSUE_MODAL':
      return { ...state, jiraIssueModal: null };
    case 'OPEN_PASTED_IMAGE_MODAL':
      return { ...state, pastedImageModal: action.payload };
    case 'CLOSE_PASTED_IMAGE_MODAL':
      return { ...state, pastedImageModal: null };
    case 'SET_ORCHESTRATOR_CHAT':
      return {
        ...state,
        orchestratorChat: { ...state.orchestratorChat, ...action.payload },
      };
    case 'RESET_ORCHESTRATOR_CHAT':
      return {
        ...state,
        orchestratorChat: {
          messages: [],
          input: '',
          busy: false,
          recentTasksVisible: true,
        },
      };
    default:
      return state;
  }
}
