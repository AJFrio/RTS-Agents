import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { useElectronAPI } from './ElectronAPI.jsx';

const VIEWS = ['agent', 'dashboard', 'branches', 'pull-requests', 'computers', 'jira', 'settings'];

const initialState = {
  currentView: 'dashboard',
  agents: [],
  filteredAgents: [],
  filters: {
    providers: {
      gemini: true,
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
    gemini: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    opencode: 0,
    total: 0,
  },
  configuredServices: {
    gemini: false,
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
    gemini: { cloud: false, local: false },
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
  // Modals
  agentModal: null,
  newTaskModalOpen: false,
  createRepoModalOpen: false,
  prModal: null,
  confirmModal: null,
  jiraIssueModal: null,
  pastedImageModal: null,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_AGENTS':
      return { ...state, agents: action.payload.agents ?? state.agents, counts: action.payload.counts ?? state.counts, errors: action.payload.errors ?? state.errors };
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
      return { ...state, github: { ...state.github, allPrs: action.payload, loadingAllPrs: false, allPrsError: null } };
    case 'SET_ALL_PRS_LOADING':
      return { ...state, github: { ...state.github, loadingAllPrs: action.payload } };
    case 'SET_ALL_PRS_ERROR':
      return { ...state, github: { ...state.github, loadingAllPrs: false, allPrsError: action.payload } };
    case 'REMOVE_PR':
      return { ...state, github: { ...state.github, allPrs: state.github.allPrs.filter(pr => pr.id !== action.payload) } };
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
          presetEnvironment: action.payload?.presetEnvironment !== undefined ? action.payload.presetEnvironment : null,
          presetTargetDeviceId:
            action.payload?.presetTargetDeviceId !== undefined ? action.payload.presetTargetDeviceId : null,
          presetPreferredProvider:
            action.payload?.presetPreferredProvider !== undefined ? action.payload.presetPreferredProvider : null
        }
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
          presetPreferredProvider: null
        }
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

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const api = useElectronAPI();

  const loadSettings = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.getSettings();
      dispatch({
        type: 'SET_SETTINGS',
        payload: {
          pollingInterval: result.settings?.pollingInterval ?? 30000,
          autoPolling: result.settings?.autoPolling !== false,
          geminiPaths: result.settings?.geminiPaths ?? [],
          claudePaths: result.settings?.claudePaths ?? [],
          cursorPaths: result.settings?.cursorPaths ?? [],
          codexPaths: result.settings?.codexPaths ?? [],
          githubPaths: result.githubPaths ?? result.settings?.githubPaths ?? [],
          theme: result.settings?.theme ?? 'system',
          displayMode: result.settings?.displayMode ?? 'fullscreen',
          jiraBaseUrl: result.jiraBaseUrl ?? '',
          selectedModel: result.selectedModel ?? result.settings?.selectedModel ?? 'openrouter/openai/gpt-4o',
        },
      });
      dispatch({
        type: 'SET_CONFIGURED_SERVICES',
        payload: {
          gemini: result.geminiInstalled || (result.geminiPaths?.length > 0) || false,
          jules: !!result.apiKeys?.jules,
          cursor: !!result.apiKeys?.cursor || (result.cursorPaths?.length > 0) || false,
          codex: !!result.apiKeys?.codex || (result.codexPaths?.length > 0) || false,
          'claude-cli': result.claudeCliInstalled || (result.claudePaths?.length > 0) || false,
          'claude-cloud': result.claudeCloudConfigured || !!result.apiKeys?.claude,
          opencode: !!result.opencodeInstalled,
          openrouter: !!result.apiKeys?.openrouter,
          openai: !!result.apiKeys?.openai,
          github: !!result.apiKeys?.github,
          jira: !!result.apiKeys?.jira && !!(result.jiraBaseUrl || ''),
        },
      });
      dispatch({
        type: 'SET_CAPABILITIES',
        payload: {
          gemini: { cloud: false, local: !!(result.geminiInstalled || result.geminiPaths?.length) },
          jules: { cloud: !!result.apiKeys?.jules, local: false },
          cursor: { cloud: !!result.apiKeys?.cursor, local: !!(result.cursorPaths?.length) },
          codex: { cloud: !!result.apiKeys?.codex, local: !!(result.codexPaths?.length) },
          claude: {
            cloud: !!(result.claudeCloudConfigured || result.apiKeys?.claude),
            local: !!(result.claudeCliInstalled || result.claudePaths?.length),
          },
          opencode: { cloud: false, local: !!result.opencodeInstalled },
          github: { cloud: !!result.apiKeys?.github, local: !!(result.githubPaths?.length) },
        },
      });
      dispatch({
        type: 'SET_SERVICE_INFO',
        payload: {
          apiKeys: result.apiKeys ?? {},
          cloudflare: result.cloudflare ?? { configured: false, accountId: '', namespaceTitle: 'rtsa' },
          installations: {
            gemini: !!result.geminiInstalled,
            claude: !!result.claudeCliInstalled,
            opencode: !!result.opencodeInstalled,
          },
        },
      });
      if (result.localDeviceId) dispatch({ type: 'SET_LOCAL_DEVICE_ID', payload: result.localDeviceId });
      if (result.filters?.providers) dispatch({ type: 'SET_FILTERS', payload: { providers: result.filters.providers } });
      if (result.filters?.statuses) dispatch({ type: 'SET_FILTERS', payload: { statuses: result.filters.statuses } });
      if (typeof result.filters?.search === 'string') dispatch({ type: 'SET_FILTERS', payload: { search: result.filters.search } });
      dispatch({
        type: 'SET_COMPUTERS',
        payload: { configured: !!(result.cloudflare?.configured || result.apiKeys?.cloudflare) },
      });
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }, [api]);

  const loadAgents = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent && state.agents.length === 0) dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_REFRESHING', payload: true });
    try {
      const result = await api.getAgents();
      dispatch({
        type: 'SET_AGENTS',
        payload: {
          agents: result.agents ?? [],
          counts: result.counts ?? state.counts,
          errors: result.errors ?? [],
        },
      });
    } catch (err) {
      console.error('Error loading agents:', err);
      dispatch({ type: 'SET_AGENTS', payload: { errors: [{ provider: 'system', error: err.message }] } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_REFRESHING', payload: false });
    }
  }, [api, state.agents.length, state.counts]);

  const checkConnectionStatus = useCallback(async () => {
    if (!api) return;
    try {
      const status = await api.getConnectionStatus();
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status ?? {} });
    } catch (err) {
      console.error('Error checking connection status:', err);
    }
  }, [api]);

  const fetchComputers = useCallback(async () => {
    if (!api?.listComputers) return;
    try {
      const result = await api.listComputers();
      if (result?.success) {
        dispatch({
          type: 'SET_COMPUTERS',
          payload: { list: result.computers ?? [], configured: !!result.configured },
        });
      }
    } catch (err) {
      console.warn('Background computer fetch failed:', err);
    }
  }, [api]);

  const loadRemoteQueueActivity = useCallback(async () => {
    if (!api?.getQueueActivity) return;
    dispatch({ type: 'SET_REMOTE_QUEUE', payload: { loading: true } });
    try {
      const result = await api.getQueueActivity();
      if (result?.success) {
        dispatch({
          type: 'SET_REMOTE_QUEUE',
          payload: {
            loading: false,
            devices: result.devices ?? [],
            configured: result.configured !== false,
            updatedAt: result.updatedAt || new Date().toISOString(),
            lastError: null,
          },
        });
      } else {
        dispatch({
          type: 'SET_REMOTE_QUEUE',
          payload: {
            loading: false,
            devices: [],
            lastError: result?.error || 'Failed to load queue activity',
          },
        });
      }
    } catch (err) {
      dispatch({
        type: 'SET_REMOTE_QUEUE',
        payload: { loading: false, lastError: err?.message || 'Failed to load queue activity' },
      });
    }
  }, [api]);

  const loadBranches = useCallback(async () => {
    if (!api?.github?.getRepos) return;
    dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: true } });
    try {
      const [result, localResult] = await Promise.all([
        api.github.getRepos(),
        api.projects?.getLocalRepos?.()?.catch(() => null) ?? Promise.resolve(null),
      ]);
      const localRepos = localResult?.success ? localResult.repos ?? [] : [];
      if (result?.success) {
        const repos = result.repos ?? [];
        dispatch({
          type: 'SET_GITHUB',
          payload: { repos, filteredRepos: repos, localRepos, loadingRepos: false },
        });
      } else {
        dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: false } });
      }
    } catch (err) {
      dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: false } });
    }
  }, [api]);

  const loadAllPrs = useCallback(async () => {
    if (!api?.github?.getAllPrs) return;
    dispatch({ type: 'SET_ALL_PRS_LOADING', payload: true });
    try {
      const result = await api.github.getAllPrs();
      if (result?.success) {
        dispatch({ type: 'SET_ALL_PRS', payload: result.prs || [] });
      } else {
        dispatch({ type: 'SET_ALL_PRS_ERROR', payload: result?.error || 'Failed to fetch PRs' });
      }
    } catch (err) {
      dispatch({ type: 'SET_ALL_PRS_ERROR', payload: err.message });
    }
  }, [api]);

  const removePr = useCallback((id) => {
    dispatch({ type: 'REMOVE_PR', payload: id });
  }, []);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    (async () => {
      await loadSettings();
      if (!mounted) return;
      await loadAgents();
      if (!mounted) return;
      await checkConnectionStatus();
      fetchComputers();
      loadRemoteQueueActivity();
    })();
    return () => { mounted = false; };
  }, [api, loadRemoteQueueActivity]);

  // Listen for background refresh ticks (polling)
  useEffect(() => {
    if (!api?.onRefreshTick) return;
    const unsubscribe = api.onRefreshTick(() => {
      loadAgents(true);
      loadRemoteQueueActivity();
    });
    return unsubscribe;
  }, [api, loadAgents, loadRemoteQueueActivity]);

  // Recompute filtered agents when agents or filters change
  useEffect(() => {
    const { agents, filters } = state;
    const { providers, statuses, search } = filters;
    const filtered = agents.filter((agent) => {
      if (!providers[agent.provider]) return false;
      const statusKey = agent.status === 'stopped' ? 'failed' : agent.status;
      if (!statuses[statusKey]) return false;
      if (search) {
        const searchFields = [agent.name, agent.prompt, agent.repository, agent.summary]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchFields.includes(search)) return false;
      }
      return true;
    });
    dispatch({ type: 'SET_FILTERED_AGENTS', payload: filtered });
    dispatch({ type: 'SET_PAGINATION', payload: { currentPage: 1 } });
  }, [state.agents, state.filters]);

  const value = {
    state,
    dispatch,
    api,
    loadSettings,
    loadAgents,
    checkConnectionStatus,
    fetchComputers,
    loadRemoteQueueActivity,
    loadBranches,
    loadAllPrs,
    removePr,
    setView: (view) => dispatch({ type: 'SET_VIEW', payload: view }),
    openAgentModal: (agent) => dispatch({ type: 'OPEN_AGENT_MODAL', payload: agent }),
    closeAgentModal: () => dispatch({ type: 'CLOSE_AGENT_MODAL' }),
    openNewTaskModal: (options) => dispatch({ type: 'OPEN_NEW_TASK_MODAL', payload: options }),
    closeNewTaskModal: () => dispatch({ type: 'CLOSE_NEW_TASK_MODAL' }),
    openCreateRepoModal: () => dispatch({ type: 'OPEN_CREATE_REPO_MODAL' }),
    closeCreateRepoModal: () => dispatch({ type: 'CLOSE_CREATE_REPO_MODAL' }),
    openPrModal: (pr) => dispatch({ type: 'OPEN_PR_MODAL', payload: pr }),
    closePrModal: () => dispatch({ type: 'CLOSE_PR_MODAL' }),
    openConfirmModal: (config) => dispatch({ type: 'OPEN_CONFIRM_MODAL', payload: config }),
    closeConfirmModal: () => dispatch({ type: 'CLOSE_CONFIRM_MODAL' }),
    openJiraIssueModal: (issue) => dispatch({ type: 'OPEN_JIRA_ISSUE_MODAL', payload: issue }),
    closeJiraIssueModal: () => dispatch({ type: 'CLOSE_JIRA_ISSUE_MODAL' }),
    openPastedImageModal: (imageUrl) => dispatch({ type: 'OPEN_PASTED_IMAGE_MODAL', payload: imageUrl }),
    closePastedImageModal: () => dispatch({ type: 'CLOSE_PASTED_IMAGE_MODAL' }),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { VIEWS };
export default AppContext;
