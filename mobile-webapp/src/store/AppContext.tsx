/**
 * App Context
 * 
 * Global state management for the RTS Agents mobile PWA
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type {
  AgentTask,
  AgentDetails,
  Provider,
  ProviderCounts,
  AppSettings,
  Computer,
  GithubRepo,
  PullRequest,
  Repository,
} from './types';
import {
  julesService,
  cursorService,
  codexService,
  claudeService,
  githubService,
  cloudflareKvService,
  storageService,
} from '../services';

// ============================================
// State Types
// ============================================

interface AppState {
  // Agents
  agents: AgentTask[];
  filteredAgents: AgentTask[];
  selectedAgent: AgentDetails | null;
  
  // Filters
  filters: {
    providers: Record<string, boolean>;
    statuses: Record<string, boolean>;
    search: string;
  };
  
  // Counts
  counts: ProviderCounts;
  
  // Settings
  settings: AppSettings;
  
  // Configured services
  configuredServices: Record<string, boolean>;
  
  // Loading states
  loading: boolean;
  loadingAgent: boolean;
  
  // Errors
  errors: string[];
  
  // Computers (from Cloudflare KV)
  computers: Computer[];
  loadingComputers: boolean;
  
  // GitHub
  githubRepos: GithubRepo[];
  selectedRepo: GithubRepo | null;
  pullRequests: PullRequest[];
  loadingRepos: boolean;
  loadingPRs: boolean;
  
  // UI State
  currentView: 'dashboard' | 'branches' | 'computers' | 'jira' | 'settings';
  showNewTaskModal: boolean;
  showAgentModal: boolean;
}

type AppAction =
  | { type: 'SET_AGENTS'; payload: AgentTask[] }
  | { type: 'SET_FILTERED_AGENTS'; payload: AgentTask[] }
  | { type: 'SET_SELECTED_AGENT'; payload: AgentDetails | null }
  | { type: 'SET_FILTERS'; payload: Partial<AppState['filters']> }
  | { type: 'SET_COUNTS'; payload: ProviderCounts }
  | { type: 'SET_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'SET_CONFIGURED_SERVICES'; payload: Record<string, boolean> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOADING_AGENT'; payload: boolean }
  | { type: 'SET_ERRORS'; payload: string[] }
  | { type: 'ADD_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_COMPUTERS'; payload: Computer[] }
  | { type: 'SET_LOADING_COMPUTERS'; payload: boolean }
  | { type: 'SET_GITHUB_REPOS'; payload: GithubRepo[] }
  | { type: 'SET_SELECTED_REPO'; payload: GithubRepo | null }
  | { type: 'SET_PULL_REQUESTS'; payload: PullRequest[] }
  | { type: 'SET_LOADING_REPOS'; payload: boolean }
  | { type: 'SET_LOADING_PRS'; payload: boolean }
  | { type: 'SET_VIEW'; payload: AppState['currentView'] }
  | { type: 'SET_SHOW_NEW_TASK_MODAL'; payload: boolean }
  | { type: 'SET_SHOW_AGENT_MODAL'; payload: boolean };

// ============================================
// Initial State
// ============================================

const initialState: AppState = {
  agents: [],
  filteredAgents: [],
  selectedAgent: null,
  filters: storageService.getFilters(),
  counts: {
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cloud': 0,
    total: 0,
  },
  settings: storageService.getSettings(),
  configuredServices: storageService.getApiKeyStatus(),
  loading: false,
  loadingAgent: false,
  errors: [],
  computers: [],
  loadingComputers: false,
  githubRepos: [],
  selectedRepo: null,
  pullRequests: [],
  loadingRepos: false,
  loadingPRs: false,
  currentView: 'dashboard',
  showNewTaskModal: false,
  showAgentModal: false,
};

// ============================================
// Reducer
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_AGENTS':
      return { ...state, agents: action.payload };
    case 'SET_FILTERED_AGENTS':
      return { ...state, filteredAgents: action.payload };
    case 'SET_SELECTED_AGENT':
      return { ...state, selectedAgent: action.payload };
    case 'SET_FILTERS':
      const newFilters = { ...state.filters, ...action.payload };
      storageService.setFilters(newFilters);
      return { ...state, filters: newFilters };
    case 'SET_COUNTS':
      return { ...state, counts: action.payload };
    case 'SET_SETTINGS':
      const newSettings = { ...state.settings, ...action.payload };
      storageService.setSettings(newSettings);
      return { ...state, settings: newSettings };
    case 'SET_CONFIGURED_SERVICES':
      return { ...state, configuredServices: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_LOADING_AGENT':
      return { ...state, loadingAgent: action.payload };
    case 'SET_ERRORS':
      return { ...state, errors: action.payload };
    case 'ADD_ERROR':
      return { ...state, errors: [...state.errors, action.payload] };
    case 'CLEAR_ERRORS':
      return { ...state, errors: [] };
    case 'SET_COMPUTERS':
      return { ...state, computers: action.payload };
    case 'SET_LOADING_COMPUTERS':
      return { ...state, loadingComputers: action.payload };
    case 'SET_GITHUB_REPOS':
      return { ...state, githubRepos: action.payload };
    case 'SET_SELECTED_REPO':
      return { ...state, selectedRepo: action.payload };
    case 'SET_PULL_REQUESTS':
      return { ...state, pullRequests: action.payload };
    case 'SET_LOADING_REPOS':
      return { ...state, loadingRepos: action.payload };
    case 'SET_LOADING_PRS':
      return { ...state, loadingPRs: action.payload };
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_SHOW_NEW_TASK_MODAL':
      return { ...state, showNewTaskModal: action.payload };
    case 'SET_SHOW_AGENT_MODAL':
      return { ...state, showAgentModal: action.payload };
    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  
  // Actions
  refreshAgents: () => Promise<void>;
  loadAgentDetails: (provider: Provider, rawId: string) => Promise<void>;
  loadComputers: () => Promise<void>;
  loadGithubRepos: () => Promise<void>;
  loadPullRequests: (owner: string, repo: string) => Promise<void>;
  createTask: (provider: Provider, options: {
    prompt: string;
    repository: string;
    branch?: string;
    autoCreatePr?: boolean;
  }) => Promise<AgentTask>;
  dispatchRemoteTask: (deviceId: string, task: {
    tool: string;
    repo: string;
    prompt: string;
  }) => Promise<void>;
  setApiKey: (provider: string, key: string) => void;
  testApiKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
  setCloudflareConfig: (config: { accountId: string; apiToken: string }) => void;
  testCloudflareConfig: () => Promise<{ success: boolean; error?: string }>;
  pullKeysFromKV: () => Promise<{ success: boolean; keysImported: string[]; error?: string }>;
  initializeServices: () => void;
  applyFilters: () => void;
  getRepositories: (provider: Provider) => Promise<Repository[]>;
  enableNotifications: () => Promise<string>;
}

const AppContext = createContext<AppContextType | null>(null);

// ============================================
// Provider Component
// ============================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const pollingRef = useRef<number | null>(null);
  const lastReadyTaskIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  // Request notification permission (user triggered)
  const enableNotifications = useCallback(async (): Promise<string> => {
    if (!('Notification' in window)) {
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    return permission;
  }, []);

  // Initialize services with stored API keys
  const initializeServices = useCallback(() => {
    const julesKey = storageService.getApiKey('jules');
    const cursorKey = storageService.getApiKey('cursor');
    const codexKey = storageService.getApiKey('codex');
    const claudeKey = storageService.getApiKey('claude');
    const githubKey = storageService.getApiKey('github');
    const cfConfig = storageService.getCloudflareConfig();

    if (julesKey) julesService.setApiKey(julesKey);
    if (cursorKey) cursorService.setApiKey(cursorKey);
    if (codexKey) codexService.setApiKey(codexKey);
    if (claudeKey) claudeService.setApiKey(claudeKey);
    if (githubKey) githubService.setApiKey(githubKey);
    if (cfConfig) cloudflareKvService.setConfig(cfConfig);

    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
  }, []);

  // Set API key for a provider
  const setApiKey = useCallback((provider: string, key: string) => {
    storageService.setApiKey(provider, key);

    switch (provider) {
      case 'jules':
        julesService.setApiKey(key);
        break;
      case 'cursor':
        cursorService.setApiKey(key);
        break;
      case 'codex':
        codexService.setApiKey(key);
        break;
      case 'claude':
        claudeService.setApiKey(key);
        break;
      case 'github':
        githubService.setApiKey(key);
        break;
    }

    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
  }, []);

  // Test API key for a provider
  const testApiKey = useCallback(async (provider: string): Promise<{ success: boolean; error?: string }> => {
    switch (provider) {
      case 'jules':
        return julesService.testConnection();
      case 'cursor':
        return cursorService.testConnection();
      case 'codex':
        return codexService.testConnection();
      case 'claude':
        return claudeService.testConnection();
      case 'github':
        return githubService.testConnection();
      default:
        return { success: false, error: 'Unknown provider' };
    }
  }, []);

  // Set Cloudflare config
  const setCloudflareConfig = useCallback((config: { accountId: string; apiToken: string }) => {
    storageService.setCloudflareConfig(config);
    cloudflareKvService.setConfig(config);
    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
  }, []);

  // Test Cloudflare config
  const testCloudflareConfig = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return cloudflareKvService.testConnection();
  }, []);

  // Pull API keys from Cloudflare KV store
  const pullKeysFromKV = useCallback(async (): Promise<{ success: boolean; keysImported: string[]; error?: string }> => {
    if (!cloudflareKvService.isConfigured()) {
      return { success: false, keysImported: [], error: 'Cloudflare KV not configured' };
    }

    try {
      const keys = await cloudflareKvService.pullKeys();
      const keysImported: string[] = [];

      // Map KV key names to our provider names
      const keyMapping: Record<string, string> = {
        jules: 'jules',
        julesApiKey: 'jules',
        cursor: 'cursor',
        cursorApiKey: 'cursor',
        codex: 'codex',
        codexApiKey: 'codex',
        openai: 'codex',
        openaiApiKey: 'codex',
        claude: 'claude',
        claudeApiKey: 'claude',
        anthropic: 'claude',
        anthropicApiKey: 'claude',
        github: 'github',
        githubApiKey: 'github',
        githubToken: 'github',
      };

      for (const [kvKey, value] of Object.entries(keys)) {
        if (!value || typeof value !== 'string') continue;
        
        const provider = keyMapping[kvKey] || kvKey;
        
        // Only import recognized providers
        if (['jules', 'cursor', 'codex', 'claude', 'github'].includes(provider)) {
          storageService.setApiKey(provider, value);
          
          // Update the service
          switch (provider) {
            case 'jules':
              julesService.setApiKey(value);
              break;
            case 'cursor':
              cursorService.setApiKey(value);
              break;
            case 'codex':
              codexService.setApiKey(value);
              break;
            case 'claude':
              claudeService.setApiKey(value);
              break;
            case 'github':
              githubService.setApiKey(value);
              break;
          }
          
          if (!keysImported.includes(provider)) {
            keysImported.push(provider);
          }
        }
      }

      // Update configured services state
      dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });

      return { success: true, keysImported };
    } catch (err) {
      return { 
        success: false, 
        keysImported: [], 
        error: err instanceof Error ? err.message : 'Failed to pull keys' 
      };
    }
  }, []);

  // Refresh all agents
  const refreshAgents = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'CLEAR_ERRORS' });

    const allAgents: AgentTask[] = [];
    const errors: string[] = [];
    const counts: ProviderCounts = {
      jules: 0,
      cursor: 0,
      codex: 0,
      'claude-cloud': 0,
      total: 0,
    };

    // Fetch from all configured providers in parallel
    const promises: Promise<void>[] = [];

    if (julesService.isConfigured()) {
      promises.push(
        julesService.getAllAgents()
          .then(agents => {
            allAgents.push(...agents);
            counts.jules = agents.length;
          })
          .catch(err => { errors.push(`Jules: ${err.message}`); })
      );
    }

    if (cursorService.isConfigured()) {
      promises.push(
        cursorService.getAllAgents()
          .then(agents => {
            allAgents.push(...agents);
            counts.cursor = agents.length;
          })
          .catch(err => { errors.push(`Cursor: ${err.message}`); })
      );
    }

    if (codexService.isConfigured()) {
      promises.push(
        codexService.getAllAgents()
          .then(agents => {
            allAgents.push(...agents);
            counts.codex = agents.length;
          })
          .catch(err => { errors.push(`Codex: ${err.message}`); })
      );
    }

    if (claudeService.isConfigured()) {
      promises.push(
        claudeService.getAllAgents()
          .then(agents => {
            allAgents.push(...agents);
            counts['claude-cloud'] = agents.length;
          })
          .catch(err => { errors.push(`Claude: ${err.message}`); })
      );
    }

    await Promise.allSettled(promises);

    // Sort by most recent first
    allAgents.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    counts.total = allAgents.length;

    // Check for notifications
    const readyAgents = allAgents.filter(a => a.status === 'completed' && a.prUrl);
    const readyIds = new Set(readyAgents.map(a => a.id));

    if (isFirstLoad.current) {
      lastReadyTaskIds.current = readyIds;
      isFirstLoad.current = false;
    } else {
      const newIds = readyAgents.filter(a => !lastReadyTaskIds.current.has(a.id));
      if (newIds.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
        try {
          // eslint-disable-next-line no-new
          new Notification('RTS Agents', {
            body: `${readyAgents.length} tasks ready for review`,
            icon: '/icons/icon-192x192.png'
          });
        } catch (e) {
          console.error('Failed to send notification', e);
        }
      }
      lastReadyTaskIds.current = readyIds;
    }

    dispatch({ type: 'SET_AGENTS', payload: allAgents });
    dispatch({ type: 'SET_COUNTS', payload: counts });
    dispatch({ type: 'SET_ERRORS', payload: errors });
    dispatch({ type: 'SET_LOADING', payload: false });
  }, []);

  // Apply filters to agents
  const applyFilters = useCallback(() => {
    const { agents, filters } = state;

    const filtered = agents.filter(agent => {
      // Provider filter
      if (!filters.providers[agent.provider]) return false;

      // Status filter
      if (!filters.statuses[agent.status]) return false;

      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesName = agent.name.toLowerCase().includes(search);
        const matchesPrompt = agent.prompt?.toLowerCase().includes(search);
        const matchesRepo = agent.repository?.toLowerCase().includes(search);
        if (!matchesName && !matchesPrompt && !matchesRepo) return false;
      }

      return true;
    });

    dispatch({ type: 'SET_FILTERED_AGENTS', payload: filtered });
  }, [state.agents, state.filters]);

  // Load agent details
  const loadAgentDetails = useCallback(async (provider: Provider, rawId: string) => {
    dispatch({ type: 'SET_LOADING_AGENT', payload: true });

    try {
      let details: AgentDetails | null = null;

      switch (provider) {
        case 'jules':
          details = await julesService.getAgentDetails(rawId);
          break;
        case 'cursor':
          details = await cursorService.getAgentDetails(rawId);
          break;
        case 'codex':
          details = await codexService.getAgentDetails(rawId);
          break;
        case 'claude-cloud':
          details = await claudeService.getAgentDetails(rawId);
          break;
      }

      dispatch({ type: 'SET_SELECTED_AGENT', payload: details });
    } catch (err) {
      dispatch({ type: 'ADD_ERROR', payload: `Failed to load agent details: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      dispatch({ type: 'SET_LOADING_AGENT', payload: false });
    }
  }, []);

  // Load computers from Cloudflare KV
  const loadComputers = useCallback(async () => {
    if (!cloudflareKvService.isConfigured()) return;

    dispatch({ type: 'SET_LOADING_COMPUTERS', payload: true });

    try {
      const computers = await cloudflareKvService.listComputers();
      dispatch({ type: 'SET_COMPUTERS', payload: computers });
    } catch (err) {
      dispatch({ type: 'ADD_ERROR', payload: `Failed to load computers: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      dispatch({ type: 'SET_LOADING_COMPUTERS', payload: false });
    }
  }, []);

  // Load GitHub repos
  const loadGithubRepos = useCallback(async () => {
    if (!githubService.isConfigured()) return;

    dispatch({ type: 'SET_LOADING_REPOS', payload: true });

    try {
      const repos = await githubService.getUserRepos();
      dispatch({ type: 'SET_GITHUB_REPOS', payload: repos });
    } catch (err) {
      dispatch({ type: 'ADD_ERROR', payload: `Failed to load repositories: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      dispatch({ type: 'SET_LOADING_REPOS', payload: false });
    }
  }, []);

  // Load pull requests for a repo
  const loadPullRequests = useCallback(async (owner: string, repo: string) => {
    if (!githubService.isConfigured()) return;

    dispatch({ type: 'SET_LOADING_PRS', payload: true });

    try {
      const prs = await githubService.getPullRequests(owner, repo);
      dispatch({ type: 'SET_PULL_REQUESTS', payload: prs });
    } catch (err) {
      dispatch({ type: 'ADD_ERROR', payload: `Failed to load pull requests: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      dispatch({ type: 'SET_LOADING_PRS', payload: false });
    }
  }, []);

  // Create a new task
  const createTask = useCallback(async (
    provider: Provider,
    options: {
      prompt: string;
      repository: string;
      branch?: string;
      autoCreatePr?: boolean;
    }
  ): Promise<AgentTask> => {
    switch (provider) {
      case 'jules':
        return julesService.createSession({
          prompt: options.prompt,
          source: options.repository,
          branch: options.branch,
          autoCreatePr: options.autoCreatePr,
        });
      case 'cursor':
        return cursorService.createAgent({
          prompt: options.prompt,
          repository: options.repository,
          ref: options.branch,
          autoCreatePr: options.autoCreatePr,
        });
      case 'codex':
        return codexService.createTask({
          prompt: options.prompt,
          repository: options.repository,
          branch: options.branch,
        });
      case 'claude-cloud':
        return claudeService.createTask({
          prompt: options.prompt,
          repository: options.repository,
        });
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }, []);

  // Dispatch remote task to a device
  const dispatchRemoteTask = useCallback(async (
    deviceId: string,
    task: { tool: string; repo: string; prompt: string }
  ) => {
    await cloudflareKvService.enqueueDeviceTask(deviceId, task);
  }, []);

  // Get repositories for a provider
  const getRepositories = useCallback(async (provider: Provider): Promise<Repository[]> => {
    switch (provider) {
      case 'jules':
        return julesService.getAllSources();
      case 'cursor':
        return cursorService.getAllRepositories();
      default:
        return [];
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeServices();
  }, [initializeServices]);

  // Apply filters when agents or filters change
  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Set up polling
  useEffect(() => {
    if (state.settings.autoPolling) {
      // Initial fetch
      refreshAgents();

      // Set up interval
      pollingRef.current = window.setInterval(() => {
        refreshAgents();
      }, state.settings.pollingInterval);
    }

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [state.settings.autoPolling, state.settings.pollingInterval, refreshAgents]);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    const { theme } = state.settings;

    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.settings.theme]);

  const contextValue: AppContextType = {
    state,
    dispatch,
    refreshAgents,
    loadAgentDetails,
    loadComputers,
    loadGithubRepos,
    loadPullRequests,
    createTask,
    dispatchRemoteTask,
    setApiKey,
    testApiKey,
    setCloudflareConfig,
    testCloudflareConfig,
    pullKeysFromKV,
    initializeServices,
    applyFilters,
    getRepositories,
    enableNotifications,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
