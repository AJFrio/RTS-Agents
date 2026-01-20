const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System info
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },

  // ============================================
  // Agents API
  // ============================================
  
  /**
   * Get all agents from all providers
   * @returns {Promise<{agents: Array, errors: Array, counts: Object}>}
   */
  getAgents: () => ipcRenderer.invoke('agents:get-all'),
  
  /**
   * Get detailed information for a specific agent
   * @param {string} provider - 'gemini', 'jules', or 'cursor'
   * @param {string} rawId - The provider's native ID
   * @param {string} [filePath] - For Gemini, the path to the session file
   */
  getAgentDetails: (provider, rawId, filePath) => 
    ipcRenderer.invoke('agents:get-details', { provider, rawId, filePath }),

  // ============================================
  // Settings API
  // ============================================
  
  /**
   * Get all settings and API key status
   */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  
  /**
   * Set an API key for a provider
   * @param {string} provider - 'jules' or 'cursor'
   * @param {string} key - The API key
   */
  setApiKey: (provider, key) => 
    ipcRenderer.invoke('settings:set-api-key', { provider, key }),
  
  /**
   * Test if an API key is valid
   * @param {string} provider - 'jules' or 'cursor'
   */
  testApiKey: (provider) => 
    ipcRenderer.invoke('settings:test-api-key', { provider }),
  
  /**
   * Remove an API key for a provider (disconnect)
   * @param {string} provider - 'jules', 'cursor', 'codex', or 'claude'
   */
  removeApiKey: (provider) => 
    ipcRenderer.invoke('settings:remove-api-key', { provider }),

  // ============================================
  // Cloudflare KV / Computers API
  // ============================================

  /**
   * Save Cloudflare KV config (Account ID + API token)
   */
  setCloudflareConfig: (accountId, apiToken, namespaceTitle) =>
    ipcRenderer.invoke('cloudflare:set-config', { accountId, apiToken, namespaceTitle }),

  /**
   * Clear Cloudflare KV config
   */
  clearCloudflareConfig: () =>
    ipcRenderer.invoke('cloudflare:clear-config'),

  /**
   * Test Cloudflare KV connectivity and ensure namespace
   */
  testCloudflare: () =>
    ipcRenderer.invoke('cloudflare:test'),

  /**
   * List computers (devices) stored in Cloudflare KV
   */
  listComputers: () =>
    ipcRenderer.invoke('computers:list'),
  
  /**
   * Push all local keys to Cloudflare KV
   */
  pushKeysToCloudflare: () =>
    ipcRenderer.invoke('cloudflare:push-keys'),

  /**
   * Pull all keys from Cloudflare KV to local storage
   */
  pullKeysFromCloudflare: () =>
    ipcRenderer.invoke('cloudflare:pull-keys'),

  /**
   * Update polling settings
   * @param {boolean} [enabled] - Whether auto-polling is enabled
   * @param {number} [interval] - Polling interval in milliseconds
   */
  setPolling: (enabled, interval) => 
    ipcRenderer.invoke('settings:set-polling', { enabled, interval }),
  
  /**
   * Set application theme
   * @param {string} theme - 'system', 'light', or 'dark'
   */
  setTheme: (theme) => 
    ipcRenderer.invoke('settings:set-theme', { theme }),

  /**
   * Set display mode
   * @param {string} mode - 'fullscreen' or 'windowed'
   */
  setDisplayMode: (mode) =>
    ipcRenderer.invoke('settings:set-display-mode', { mode }),

  /**
   * Save filter settings
   * @param {object} filters
   */
  saveFilters: (filters) =>
    ipcRenderer.invoke('settings:save-filters', { filters }),

  /**
   * Add a Gemini project path to scan
   * @param {string} path 
   */
  addGeminiPath: (path) => 
    ipcRenderer.invoke('settings:add-gemini-path', { path }),
  
  /**
   * Remove a Gemini project path
   * @param {string} path 
   */
  removeGeminiPath: (path) => 
    ipcRenderer.invoke('settings:remove-gemini-path', { path }),
  
  /**
   * Get Gemini paths configuration
   */
  getGeminiPaths: () => 
    ipcRenderer.invoke('settings:get-gemini-paths'),

  /**
   * Add a GitHub repository path
   * @param {string} path 
   */
  addGithubPath: (path) => 
    ipcRenderer.invoke('settings:add-github-path', { path }),

  /**
   * Remove a GitHub repository path
   * @param {string} path 
   */
  removeGithubPath: (path) => 
    ipcRenderer.invoke('settings:remove-github-path', { path }),

  /**
   * Get GitHub repository paths
   */
  getGithubPaths: () => 
    ipcRenderer.invoke('settings:get-github-paths'),

  /**
   * Get all project paths (combined Gemini + GitHub)
   */
  getAllProjectPaths: () => 
    ipcRenderer.invoke('settings:get-all-project-paths'),

  /**
   * Update the application (git pull + restart)
   */
  updateApp: () =>
    ipcRenderer.invoke('app:update'),

  // ============================================
  // Utilities API
  // ============================================
  
  /**
   * Open a URL in the default browser
   * @param {string} url 
   */
  openExternal: (url) => 
    ipcRenderer.invoke('utils:open-external', { url }),
  
  /**
   * Get connection status for all providers
   */
  getConnectionStatus: () => 
    ipcRenderer.invoke('utils:get-status'),

  // ============================================
  // Task Creation API
  // ============================================

  /**
   * Get available repositories for a specific provider
   * @param {string} provider - 'gemini', 'jules', or 'cursor'
   */
  getRepositories: (provider) =>
    ipcRenderer.invoke('repos:get', { provider }),

  /**
   * Get repositories from all configured providers
   */
  getAllRepositories: () =>
    ipcRenderer.invoke('repos:get-all'),

  /**
   * Create a new task/session
   * @param {string} provider - 'gemini', 'jules', or 'cursor'
   * @param {object} options - Provider-specific options
   * @param {string} options.prompt - Task description
   * @param {string} options.repository - Repository URL or source name
   * @param {string} [options.branch] - Branch name (defaults to 'main')
   * @param {boolean} [options.autoCreatePr] - Auto-create PR (defaults to true)
   */
  createTask: (provider, options) =>
    ipcRenderer.invoke('tasks:create', { provider, options }),

  // ============================================
  // Events API
  // ============================================
  
  /**
   * Listen for refresh tick events from polling
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  onRefreshTick: (callback) => {
    const subscription = (event) => callback();
    ipcRenderer.on('agents:refresh-tick', subscription);
    return () => {
      ipcRenderer.removeListener('agents:refresh-tick', subscription);
    };
  },

  // ============================================
  // GitHub API
  // ============================================
  
  github: {
    getRepos: () => ipcRenderer.invoke('github:get-repos'),
    getPrs: (owner, repo, state) => ipcRenderer.invoke('github:get-prs', { owner, repo, state }),
    getBranches: (owner, repo) => ipcRenderer.invoke('github:get-branches', { owner, repo }),
    getPrDetails: (owner, repo, prNumber) => ipcRenderer.invoke('github:get-pr-details', { owner, repo, prNumber }),
    mergePr: (owner, repo, prNumber, method) => ipcRenderer.invoke('github:merge-pr', { owner, repo, prNumber, method }),
    markPrReadyForReview: (nodeId) => ipcRenderer.invoke('github:mark-pr-ready-for-review', { nodeId })
  }
});
