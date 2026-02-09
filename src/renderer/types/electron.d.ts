export interface ElectronAPI {
  // System
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };

  // Agents
  getAgents: () => Promise<{ agents: any[]; errors: any[]; counts: any }>;
  getAgentDetails: (provider: string, rawId: string, filePath?: string) => Promise<any>;

  // Settings
  getSettings: () => Promise<any>;
  setApiKey: (provider: string, key: string) => Promise<{ success: boolean }>;
  setJiraBaseUrl: (url: string) => Promise<{ success: boolean }>;
  testApiKey: (provider: string) => Promise<{ success: boolean; error?: string }>;
  removeApiKey: (provider: string) => Promise<{ success: boolean }>;
  setPolling: (enabled: boolean, interval: number) => Promise<{ success: boolean }>;
  setTheme: (theme: string) => Promise<{ success: boolean }>;
  setDisplayMode: (mode: string) => Promise<{ success: boolean }>;
  saveFilters: (filters: any) => Promise<{ success: boolean }>;

  // Paths
  addGeminiPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  removeGeminiPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  getGeminiPaths: () => Promise<{ paths: string[]; defaultPath: string; installed: boolean }>;

  addClaudePath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  removeClaudePath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  getClaudePaths: () => Promise<{ paths: string[]; defaultPath: string; installed: boolean }>;

  addCursorPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  removeCursorPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  getCursorPaths: () => Promise<{ paths: string[] }>;

  addCodexPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  removeCodexPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  getCodexPaths: () => Promise<{ paths: string[] }>;

  addGithubPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  removeGithubPath: (path: string) => Promise<{ success: boolean; paths: string[] }>;
  getGithubPaths: () => Promise<{ paths: string[] }>;
  getAllProjectPaths: () => Promise<{ paths: string[]; geminiPaths: string[]; claudePaths: string[]; cursorPaths: string[]; codexPaths: string[]; githubPaths: string[] }>;

  // Cloudflare
  setCloudflareConfig: (accountId: string, apiToken: string, namespaceTitle?: string) => Promise<{ success: boolean }>;
  clearCloudflareConfig: () => Promise<{ success: boolean }>;
  testCloudflare: () => Promise<{ success: boolean; error?: string; namespaceId?: string }>;
  listComputers: () => Promise<{ success: boolean; configured: boolean; computers: any[] }>;
  pushKeysToCloudflare: () => Promise<{ success: boolean; error?: string }>;
  pullKeysFromCloudflare: () => Promise<{ success: boolean; error?: string; keys?: any }>;

  // App Update
  updateApp: () => Promise<{ success: boolean; error?: string }>;

  // Utils
  openExternal: (url: string) => Promise<{ success: boolean }>;
  openDirectory: () => Promise<string | null>;
  getConnectionStatus: () => Promise<any>;

  // Tasks
  getRepositories: (provider: string) => Promise<{ success: boolean; repositories: any[]; error?: string }>;
  getAllRepositories: () => Promise<any>;
  createTask: (provider: string, options: any) => Promise<{ success: boolean; task?: any; error?: string }>;
  sendMessage: (provider: string, rawId: string, message: string) => Promise<{ success: boolean; error?: string }>;

  // Events
  onRefreshTick: (callback: () => void) => () => void;

  // GitHub
  github: {
    getRepos: () => Promise<{ success: boolean; repos: any[]; error?: string }>;
    getPrs: (owner: string, repo: string, state: string) => Promise<{ success: boolean; prs: any[]; error?: string }>;
    getBranches: (owner: string, repo: string) => Promise<{ success: boolean; branches: any[]; error?: string }>;
    getOwners: () => Promise<{ success: boolean; user?: any; orgs?: any[]; error?: string }>;
    getPrDetails: (owner: string, repo: string, prNumber: number) => Promise<{ success: boolean; pr: any; error?: string }>;
    mergePr: (owner: string, repo: string, prNumber: number, method?: string) => Promise<{ success: boolean; result: any; error?: string }>;
    closePr: (owner: string, repo: string, prNumber: number) => Promise<{ success: boolean; result: any; error?: string }>;
    markPrReadyForReview: (nodeId: string) => Promise<{ success: boolean; result?: any; error?: string }>;
    createRepo: (options: { ownerType: string; owner: string; name: string; private: boolean }) => Promise<{ success: boolean; repo?: any; error?: string }>;
  };

  // Jira
  jira: {
    getBoards: () => Promise<{ success: boolean; boards: any[]; error?: string }>;
    getSprints: (boardId: string) => Promise<{ success: boolean; sprints: any[]; error?: string }>;
    getBacklogIssues: (boardId: string) => Promise<{ success: boolean; issues: any[]; error?: string }>;
    getSprintIssues: (sprintId: string) => Promise<{ success: boolean; issues: any[]; error?: string }>;
    getIssue: (issueKey: string) => Promise<{ success: boolean; issue: any; error?: string }>;
    getIssueComments: (issueKey: string) => Promise<{ success: boolean; comments: any[]; error?: string }>;
  };

  // Projects
  projects: {
    createLocalRepo: (options: { name: string; directory: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
    enqueueCreateRepo: (options: { deviceId: string; name: string }) => Promise<{ success: boolean; task?: any; error?: string }>;
    getLocalRepos: () => Promise<{ success: boolean; repos: any[]; error?: string }>;
    pullRepo: (path: string) => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
