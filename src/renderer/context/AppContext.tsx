import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Define types based on app.js state
export interface Agent {
  id: string;
  provider: string;
  name: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  repository?: string;
  branch?: string;
  prUrl?: string;
  filePath?: string;
  rawId?: string;
}

export interface Filters {
  providers: Record<string, boolean>;
  statuses: Record<string, boolean>;
  search: string;
}

export interface Settings {
  pollingInterval: number;
  autoPolling: boolean;
  geminiPaths: string[];
  claudePaths: string[];
  cursorPaths: string[];
  codexPaths: string[];
  githubPaths: string[];
  theme: string;
  displayMode: string;
  jiraBaseUrl: string;
}

export interface Counts {
  gemini: number;
  jules: number;
  cursor: number;
  codex: number;
  'claude-cli': number;
  'claude-cloud': number;
  total: number;
  [key: string]: number;
}

export interface ConfiguredServices {
  gemini: boolean;
  jules: boolean;
  cursor: boolean;
  codex: boolean;
  'claude-cli': boolean;
  'claude-cloud': boolean;
  github: boolean;
  jira: boolean;
  [key: string]: boolean;
}

export interface Capabilities {
  gemini: { cloud: boolean; local: boolean };
  jules: { cloud: boolean; local: boolean };
  cursor: { cloud: boolean; local: boolean };
  codex: { cloud: boolean; local: boolean };
  claude: { cloud: boolean; local: boolean };
  github: { cloud: boolean; local: boolean };
}

export interface AppState {
  currentView: string;
  setView: (view: string) => void;
  agents: Agent[];
  filteredAgents: Agent[];
  filters: Filters;
  setFilter: (type: 'providers' | 'statuses' | 'search', key: string, value: any) => void;
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  counts: Counts;
  configuredServices: ConfiguredServices;
  capabilities: Capabilities;
  loading: boolean;
  errors: any[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
  };
  setPage: (page: number) => void;

  // Method to refresh data
  refreshAgents: (silent?: boolean) => Promise<void>;

  // Connection status for sidebar
  connectionStatus: Record<string, any>;

  // GitHub State
  github: {
    repos: any[];
    localRepos: any[];
    filteredRepos: any[];
    selectedRepo: any | null;
    prs: any[];
    loadingRepos: boolean;
    loadingPrs: boolean;
    currentPr: any | null;
    prFilter: 'open' | 'closed';
  };
  setGithubState: (newState: Partial<AppState['github']>) => void;
  loadBranches: () => Promise<void>;
  selectRepo: (repoId: number) => Promise<void>;

  // Computers State
  computers: {
    list: any[];
    loading: boolean;
    configured: boolean;
  };
  loadComputers: () => Promise<void>;

  // Jira State
  jira: {
    boards: any[];
    issues: any[];
    selectedBoardId: string | null;
    selectedAssignee: string | null;
    loading: boolean;
    error: string | null;
  };
  setJiraState: (newState: Partial<AppState['jira']>) => void;
  loadJiraBoards: () => Promise<void>;
  loadJiraIssues: (boardId: string) => Promise<void>;

  // Modals State
  modals: {
    newTask: boolean;
    createRepo: boolean;
    agentDetail: { open: boolean; agentId?: string; provider?: string; filePath?: string };
    pr: { open: boolean; pr?: any; owner?: string; repo?: string; number?: number };
    jiraIssue: { open: boolean; issueKey?: string };
  };
  openModal: (modal: 'newTask' | 'createRepo' | 'agentDetail' | 'pr' | 'jiraIssue', data?: any) => void;
  closeModal: (modal: 'newTask' | 'createRepo' | 'agentDetail' | 'pr' | 'jiraIssue') => void;
}

const defaultFilters: Filters = {
  providers: {
    gemini: true,
    jules: true,
    cursor: true,
    codex: true,
    'claude-cli': true,
    'claude-cloud': true
  },
  statuses: {
    running: true,
    completed: true,
    pending: true,
    failed: true,
    stopped: true
  },
  search: ''
};

const defaultSettings: Settings = {
  pollingInterval: 30000,
  autoPolling: true,
  geminiPaths: [],
  claudePaths: [],
  cursorPaths: [],
  codexPaths: [],
  githubPaths: [],
  theme: 'system',
  displayMode: 'fullscreen',
  jiraBaseUrl: ''
};

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setView] = useState('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [counts, setCounts] = useState<Counts>({ gemini: 0, jules: 0, cursor: 0, codex: 0, 'claude-cli': 0, 'claude-cloud': 0, total: 0 });
  const [configuredServices, setConfiguredServices] = useState<ConfiguredServices>({
    gemini: false, jules: false, cursor: false, codex: false, 'claude-cli': false, 'claude-cloud': false, github: false, jira: false
  });
  const [capabilities, setCapabilities] = useState<Capabilities>({
    gemini: { cloud: false, local: false },
    jules: { cloud: false, local: false },
    cursor: { cloud: false, local: false },
    codex: { cloud: false, local: false },
    claude: { cloud: false, local: false },
    github: { cloud: false, local: false }
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ currentPage: 1, pageSize: 50, totalPages: 1 });
  const [connectionStatus, setConnectionStatus] = useState<Record<string, any>>({});
  const [github, setGithub] = useState<AppState['github']>({
    repos: [],
    localRepos: [],
    filteredRepos: [],
    selectedRepo: null,
    prs: [],
    loadingRepos: false,
    loadingPrs: false,
    currentPr: null,
    prFilter: 'open'
  });
  const [computers, setComputers] = useState<AppState['computers']>({
    list: [],
    loading: false,
    configured: false
  });
  const [jira, setJira] = useState<AppState['jira']>({
    boards: [],
    issues: [],
    selectedBoardId: null,
    selectedAssignee: null,
    loading: false,
    error: null
  });
  const [modals, setModals] = useState<AppState['modals']>({
    newTask: false,
    createRepo: false,
    agentDetail: { open: false },
    pr: { open: false },
    jiraIssue: { open: false }
  });

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadSettings();
      await refreshAgents();
      await checkConnectionStatus();
      setLoading(false);
    };
    init();

    // Setup polling listener
    if (window.electronAPI?.onRefreshTick) {
       const unsubscribe = window.electronAPI.onRefreshTick(() => {
         refreshAgents(true);
       });
       return () => unsubscribe();
    }
  }, []);

  // Filter effect
  useEffect(() => {
    applyFilters();
  }, [agents, filters, pagination.currentPage]);

  const loadSettings = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.getSettings();
      setSettings({
        pollingInterval: result.settings?.pollingInterval || 30000,
        autoPolling: result.settings?.autoPolling !== false,
        geminiPaths: result.settings?.geminiPaths || [],
        claudePaths: result.settings?.claudePaths || [],
        cursorPaths: result.settings?.cursorPaths || [],
        codexPaths: result.settings?.codexPaths || [],
        githubPaths: result.githubPaths || result.settings?.githubPaths || [],
        theme: result.settings?.theme || 'system',
        displayMode: result.settings?.displayMode || 'fullscreen',
        jiraBaseUrl: result.jiraBaseUrl || ''
      });

      // Load configured services and capabilities
      setConfiguredServices({
        gemini: result.geminiInstalled || (result.geminiPaths && result.geminiPaths.length > 0) || false,
        jules: result.apiKeys?.jules || false,
        cursor: result.apiKeys?.cursor || (result.cursorPaths && result.cursorPaths.length > 0) || false,
        codex: result.apiKeys?.codex || (result.codexPaths && result.codexPaths.length > 0) || false,
        'claude-cli': result.claudeCliInstalled || (result.claudePaths && result.claudePaths.length > 0) || false,
        'claude-cloud': result.claudeCloudConfigured || result.apiKeys?.claude || false,
        github: result.apiKeys?.github || false,
        jira: result.apiKeys?.jira && !!result.jiraBaseUrl
      });

      setCapabilities({
        gemini: { cloud: false, local: !!(result.geminiInstalled || (result.geminiPaths && result.geminiPaths.length > 0)) },
        jules: { cloud: !!result.apiKeys?.jules, local: false },
        cursor: { cloud: !!result.apiKeys?.cursor, local: !!(result.cursorPaths && result.cursorPaths.length > 0) },
        codex: { cloud: !!result.apiKeys?.codex, local: !!(result.codexPaths && result.codexPaths.length > 0) },
        claude: {
            cloud: !!(result.claudeCloudConfigured || result.apiKeys?.claude),
            local: !!(result.claudeCliInstalled || (result.claudePaths && result.claudePaths.length > 0))
        },
        github: { cloud: !!result.apiKeys?.github, local: !!(result.githubPaths && result.githubPaths.length > 0) }
      });

      // Load filters if saved
      if (result.filters) {
         setFilters(prev => ({
            ...prev,
            providers: { ...prev.providers, ...(result.filters.providers || {}) },
            statuses: { ...prev.statuses, ...(result.filters.statuses || {}) },
            search: result.filters.search || prev.search
         }));
      }

    } catch (err) {
      console.error('Failed to load settings', err);
    }
  };

  const refreshAgents = async (silent = false) => {
    if (!window.electronAPI) return;
    if (!silent) setLoading(true);
    try {
      const result = await window.electronAPI.getAgents();
      setAgents(result.agents || []);
      setCounts(result.counts || { gemini: 0, jules: 0, cursor: 0, codex: 0, 'claude-cli': 0, 'claude-cloud': 0, total: 0 });
      setErrors(result.errors || []);
    } catch (err) {
      console.error('Failed to load agents', err);
      setErrors([{ provider: 'system', error: String(err) }]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    if (!window.electronAPI) return;
    try {
      const status = await window.electronAPI.getConnectionStatus();
      setConnectionStatus(status);
    } catch (err) {
      console.error('Failed to check connection status', err);
    }
  };

  const applyFilters = () => {
    const { providers, statuses, search } = filters;
    const filtered = agents.filter(agent => {
      if (!providers[agent.provider]) return false;
      const statusKey = agent.status === 'stopped' ? 'failed' : agent.status;
      if (!statuses[statusKey]) return false;
      if (search) {
        const searchFields = [agent.name, agent.status, agent.repository].filter(Boolean).join(' ').toLowerCase();
        if (!searchFields.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    setFilteredAgents(filtered);

    // Update pagination
    const totalPages = Math.ceil(filtered.length / pagination.pageSize);
    setPagination(prev => ({ ...prev, totalPages: Math.max(1, totalPages) }));
  };

  const setFilter = (type: 'providers' | 'statuses' | 'search', key: string, value: any) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (type === 'search') {
        newFilters.search = value;
      } else {
        newFilters[type] = { ...newFilters[type], [key]: value };
      }

      // Save filters
      window.electronAPI?.saveFilters(newFilters).catch(console.error);

      return newFilters;
    });
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const setPage = (page: number) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
      // Optimistic update
      setSettings(prev => ({ ...prev, ...newSettings }));
      // We assume the caller handles the API call to save settings if needed,
      // or we can add specific methods for saving settings here.
  };

  const setGithubState = (newState: Partial<AppState['github']>) => {
    setGithub(prev => ({ ...prev, ...newState }));
  };

  const loadBranches = async () => {
    if (!window.electronAPI) return;
    setGithubState({ loadingRepos: true });
    try {
      const [result, localResult] = await Promise.all([
        window.electronAPI.github.getRepos(),
        window.electronAPI.projects.getLocalRepos()
      ]);

      const localRepos = localResult.success ? localResult.repos : [];
      const repos = result.success ? result.repos : [];

      setGithubState({
        repos,
        localRepos,
        filteredRepos: repos,
        loadingRepos: false
      });
    } catch (err) {
      console.error('Failed to load branches', err);
      setGithubState({ loadingRepos: false });
    }
  };

  const selectRepo = async (repoId: number) => {
    const repo = github.repos.find(r => r.id === repoId);
    if (!repo) return;

    setGithubState({ selectedRepo: repo, loadingPrs: true, prs: [] });

    try {
      const result = await window.electronAPI.github.getPrs(repo.owner.login, repo.name, github.prFilter);
      if (result.success) {
        setGithubState({ prs: result.prs || [], loadingPrs: false });
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error('Failed to load PRs', err);
      setGithubState({ loadingPrs: false });
    }
  };

  const loadComputers = async () => {
    if (!window.electronAPI?.listComputers) return;
    setComputers(prev => ({ ...prev, loading: true }));
    try {
      const result = await window.electronAPI.listComputers();
      setComputers({
        list: result.computers || [],
        loading: false,
        configured: !!result.configured
      });
    } catch (err) {
      console.error('Failed to load computers', err);
      setComputers(prev => ({ ...prev, loading: false }));
    }
  };

  const setJiraState = (newState: Partial<AppState['jira']>) => {
    setJira(prev => ({ ...prev, ...newState }));
  };

  const loadJiraBoards = async () => {
    if (!window.electronAPI?.jira) return;
    setJiraState({ loading: true, error: null });
    try {
      const result = await window.electronAPI.jira.getBoards();
      if (result.success) {
        setJiraState({ boards: result.boards || [], loading: false });
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setJiraState({ loading: false, error: String(err) });
    }
  };

  const loadJiraIssues = async (boardId: string) => {
    if (!window.electronAPI?.jira) return;
    setJiraState({ loading: true, error: null, issues: [] });
    try {
      const board = jira.boards.find(b => String(b.id) === String(boardId));
      let allIssues: any[] = [];

      // Logic from app.js simplified for brevity, assume similar flow
      // Or just load backlog issues as fallback if complex logic is hard to port 1:1 right now
      // Replicating app.js logic:

      const backlogRes = await window.electronAPI.jira.getBacklogIssues(boardId);
      if (backlogRes.success && backlogRes.issues) {
          backlogRes.issues.forEach((i: any) => {
              i._group = { id: 'backlog', name: 'BACKLOG', type: 'backlog', order: 3 };
          });
          allIssues.push(...backlogRes.issues);
      }

      setJiraState({ issues: allIssues, loading: false });
    } catch (err) {
      setJiraState({ loading: false, error: String(err) });
    }
  };

  const openModal = (modal: keyof AppState['modals'], data?: any) => {
    setModals(prev => {
      if (modal === 'newTask' || modal === 'createRepo') {
        return { ...prev, [modal]: true };
      }
      return { ...prev, [modal]: { open: true, ...data } };
    });
  };

  const closeModal = (modal: keyof AppState['modals']) => {
    setModals(prev => {
      if (modal === 'newTask' || modal === 'createRepo') {
        return { ...prev, [modal]: false };
      }
      return { ...prev, [modal]: { open: false } };
    });
  };

  return (
    <AppContext.Provider value={{
      currentView, setView,
      agents, filteredAgents,
      filters, setFilter,
      settings, updateSettings,
      counts, configuredServices, capabilities,
      loading, errors,
      pagination, setPage,
      refreshAgents,
      connectionStatus,
      github, setGithubState, loadBranches, selectRepo,
      computers, loadComputers,
      jira, setJiraState, loadJiraBoards, loadJiraIssues,
      modals, openModal, closeModal
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
