export const VIEWS = ['agent', 'dashboard', 'branches', 'pull-requests', 'computers', 'jira', 'settings'];

export const initialState = {
  currentView: 'dashboard',
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
    geminiPaths: [],
    claudePaths: [],
    cursorPaths: [],
    codexPaths: [],
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
    openai: false,
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
      gemini: false,
      claude: false,
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
  agentModal: null,
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
    case 'SET_AGENTS':
      return {
        ...state,
        agents: action.payload.agents ?? state.agents,
        agentListRevision: action.payload.revision ?? state.agentListRevision,
        counts: action.payload.counts ?? state.counts,
        errors: action.payload.errors ?? state.errors,
      };
    case 'MERGE_AGENTS_DELTA': {
      const { added = [], updated = [], removed = [] } = action.payload.delta || {};
      const byId = new Map(state.agents.map((a) => [a.id, a]));
      for (const id of removed) {
        byId.delete(id);
      }
      for (const agent of updated) {
        byId.set(agent.id, agent);
      }
      for (const agent of added) {
        byId.set(agent.id, agent);
      }
      return {
        ...state,
        agents: [...byId.values()],
        agentListRevision: action.payload.revision ?? state.agentListRevision,
        counts: action.payload.counts ?? state.counts,
        errors: action.payload.errors ?? state.errors,
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
        github: { ...state.github, allPrs: action.payload, loadingAllPrs: false, allPrsError: null },
      };
    case 'SET_ALL_PRS_LOADING':
      return { ...state, github: { ...state.github, loadingAllPrs: action.payload } };
    case 'SET_ALL_PRS_ERROR':
      return {
        ...state,
        github: { ...state.github, loadingAllPrs: false, allPrsError: action.payload },
      };
    case 'REMOVE_PR':
      return {
        ...state,
        github: { ...state.github, allPrs: state.github.allPrs.filter((pr) => pr.id !== action.payload) },
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
    case 'OPEN_AGENT_MODAL':
      return { ...state, agentModal: action.payload };
    case 'CLOSE_AGENT_MODAL':
      return { ...state, agentModal: null };
    case 'OPEN_NEW_TASK_MODAL':
      return {
        ...state,
        newTaskModalOpen: true,
        newTask: {
          ...state.newTask,
          initialPrompt: action.payload?.initialPrompt ?? '',
          presetEnvironment:
            action.payload?.presetEnvironment !== undefined ? action.payload.presetEnvironment : null,
          presetTargetDeviceId:
            action.payload?.presetTargetDeviceId !== undefined ? action.payload.presetTargetDeviceId : null,
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
    default:
      return state;
  }
}
