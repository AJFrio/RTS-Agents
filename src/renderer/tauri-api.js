/**
 * Tauri API Bridge
 *
 * This module provides a unified interface to Tauri commands,
 * replacing the Electron IPC API (window.electronAPI).
 *
 * In Tauri, APIs are injected at runtime via window.__TAURI_INTERNALS__
 */

// Helper to invoke Tauri commands
async function invoke(command, args = {}) {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('Tauri APIs not available');
  }
  return window.__TAURI_INTERNALS__.invoke(command, args);
}

// Helper to listen for Tauri events
async function listen(event, callback) {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('Tauri APIs not available');
  }
  return window.__TAURI_INTERNALS__.listen(event, callback);
}

// Helper to open URLs using shell plugin
async function shellOpen(url) {
  // The shell plugin's open function is available through the invoke mechanism
  return invoke('plugin:shell|open', { path: url });
}

export const tauriAPI = {
  // ========================================
  // Agent Commands
  // ========================================

  /**
   * Get all agents from all enabled providers
   */
  getAgents: () => invoke('get_agents'),

  /**
   * Get detailed information about a specific agent
   */
  getAgentDetails: (provider, rawId, filePath) =>
    invoke('get_agent_details', { provider, rawId, filePath }),

  /**
   * Start a new agent session
   */
  startAgentSession: (provider, prompt, projectPath, repository, branch, autoCreatePr) =>
    invoke('start_agent_session', {
      provider,
      prompt,
      projectPath,
      repository,
      branch,
      autoCreatePr
    }),

  /**
   * Stop a running agent
   */
  stopAgent: (provider, rawId) => invoke('stop_agent', { provider, rawId }),

  // ========================================
  // Settings Commands
  // ========================================

  /**
   * Get all application settings
   */
  getSettings: () => invoke('get_settings'),

  /**
   * Update all application settings
   */
  setSettings: (settings) => invoke('set_settings', { settings }),

  /**
   * Get current theme
   */
  getTheme: () => invoke('get_theme'),

  /**
   * Set theme (system, light, dark)
   */
  setTheme: (theme) => invoke('set_theme', { theme }),

  /**
   * Get refresh interval in seconds
   */
  getRefreshInterval: () => invoke('get_refresh_interval'),

  /**
   * Set refresh interval
   */
  setRefreshInterval: (interval) => invoke('set_refresh_interval', { interval }),

  /**
   * Check if an API key exists for a provider
   */
  hasApiKey: (provider) => invoke('has_api_key', { provider }),

  /**
   * Set API key for a provider
   */
  setApiKey: (provider, apiKey) => invoke('set_api_key', { provider, apiKey }),

  /**
   * Delete API key for a provider
   */
  deleteApiKey: (provider) => invoke('delete_api_key', { provider }),

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled: (provider) => invoke('is_provider_enabled', { provider }),

  /**
   * Enable or disable a provider
   */
  setProviderEnabled: (provider, enabled) =>
    invoke('set_provider_enabled', { provider, enabled }),

  /**
   * Get list of enabled providers
   */
  getEnabledProviders: () => invoke('get_enabled_providers'),

  /**
   * Get configured projects
   */
  getProjects: () => invoke('get_projects'),

  /**
   * Add a project
   */
  addProject: (project) => invoke('add_project', { project }),

  /**
   * Remove a project
   */
  removeProject: (projectId) => invoke('remove_project', { projectId }),

  /**
   * Get Jira configuration (base_url, email)
   */
  getJiraConfig: () => invoke('get_jira_config'),

  /**
   * Set Jira configuration
   */
  setJiraConfig: (baseUrl, email) => invoke('set_jira_config', { baseUrl, email }),

  /**
   * Get Cloudflare configuration (account_id, namespace_id)
   */
  getCloudflareConfig: () => invoke('get_cloudflare_config'),

  /**
   * Set Cloudflare configuration
   */
  setCloudflareConfig: (accountId, namespaceId) =>
    invoke('set_cloudflare_config', { accountId, namespaceId }),

  /**
   * Migrate settings from Electron store
   */
  migrateFromElectron: (electronStorePath) =>
    invoke('migrate_from_electron', { electronStorePath }),

  /**
   * Export settings to a file
   */
  exportSettings: (path) => invoke('export_settings', { path }),

  /**
   * Import settings from a file
   */
  importSettings: (path) => invoke('import_settings', { path }),

  // ========================================
  // GitHub Commands
  // ========================================

  /**
   * Get current authenticated GitHub user
   */
  githubGetUser: () => invoke('github_get_user'),

  /**
   * Get a GitHub repository
   */
  githubGetRepo: (owner, repo) => invoke('github_get_repo', { owner, repo }),

  /**
   * List pull requests for a repository
   */
  githubListPrs: (owner, repo, prState) =>
    invoke('github_list_prs', { owner, repo, prState }),

  /**
   * Get a specific pull request
   */
  githubGetPr: (owner, repo, prNumber) =>
    invoke('github_get_pr', { owner, repo, prNumber }),

  /**
   * Get files changed in a pull request
   */
  githubGetPrFiles: (owner, repo, prNumber) =>
    invoke('github_get_pr_files', { owner, repo, prNumber }),

  /**
   * Get reviews for a pull request
   */
  githubGetPrReviews: (owner, repo, prNumber) =>
    invoke('github_get_pr_reviews', { owner, repo, prNumber }),

  /**
   * Get check runs for a commit/ref
   */
  githubGetCheckRuns: (owner, repo, refName) =>
    invoke('github_get_check_runs', { owner, repo, refName }),

  /**
   * Create a pull request
   */
  githubCreatePr: (owner, repo, title, body, head, base) =>
    invoke('github_create_pr', { owner, repo, title, body, head, base }),

  /**
   * Merge a pull request
   */
  githubMergePr: (owner, repo, prNumber, mergeMethod) =>
    invoke('github_merge_pr', { owner, repo, prNumber, mergeMethod }),

  /**
   * List user's repositories
   */
  githubListRepos: () => invoke('github_list_repos'),

  /**
   * List branches for a repository
   */
  githubListBranches: (owner, repo) =>
    invoke('github_list_branches', { owner, repo }),

  // ========================================
  // Jira Commands
  // ========================================

  /**
   * Get a Jira issue by key
   */
  jiraGetIssue: (issueKey) => invoke('jira_get_issue', { issueKey }),

  /**
   * Search Jira issues with JQL
   */
  jiraSearch: (jql, maxResults) => invoke('jira_search', { jql, maxResults }),

  /**
   * Get issues assigned to current user
   */
  jiraGetMyIssues: () => invoke('jira_get_my_issues'),

  /**
   * Get issues for a project
   */
  jiraGetProjectIssues: (projectKey) =>
    invoke('jira_get_project_issues', { projectKey }),

  /**
   * Create a Jira issue
   */
  jiraCreateIssue: (projectKey, summary, description, issueTypeId, priorityId, assigneeId) =>
    invoke('jira_create_issue', {
      projectKey, summary, description, issueTypeId, priorityId, assigneeId
    }),

  /**
   * Update a Jira issue
   */
  jiraUpdateIssue: (issueKey, summary, description) =>
    invoke('jira_update_issue', { issueKey, summary, description }),

  /**
   * Transition a Jira issue
   */
  jiraTransitionIssue: (issueKey, transitionId) =>
    invoke('jira_transition_issue', { issueKey, transitionId }),

  /**
   * Get available transitions for an issue
   */
  jiraGetTransitions: (issueKey) => invoke('jira_get_transitions', { issueKey }),

  /**
   * Get a Jira project
   */
  jiraGetProject: (projectKey) => invoke('jira_get_project', { projectKey }),

  /**
   * Get all accessible Jira projects
   */
  jiraGetProjects: () => invoke('jira_get_projects'),

  // ========================================
  // Cloudflare KV Commands
  // ========================================

  /**
   * Get a value from Cloudflare KV
   */
  cloudflareKvGet: (key) => invoke('cloudflare_kv_get', { key }),

  /**
   * Set a value in Cloudflare KV
   */
  cloudflareKvSet: (key, value, expirationTtl) =>
    invoke('cloudflare_kv_set', { key, value, expirationTtl }),

  /**
   * Delete a value from Cloudflare KV
   */
  cloudflareKvDelete: (key) => invoke('cloudflare_kv_delete', { key }),

  /**
   * List keys in Cloudflare KV
   */
  cloudflareKvList: (prefix, limit) =>
    invoke('cloudflare_kv_list', { prefix, limit }),

  /**
   * Send heartbeat to Cloudflare KV
   */
  cloudflareSendHeartbeat: () => invoke('cloudflare_send_heartbeat'),

  /**
   * Get all active heartbeats
   */
  cloudflareGetHeartbeats: () => invoke('cloudflare_get_heartbeats'),

  /**
   * Sync agent state to Cloudflare KV
   */
  cloudflareSyncAgents: (agents) => invoke('cloudflare_sync_agents', { agents }),

  /**
   * Get all agent states from all machines
   */
  cloudflareGetAllAgents: () => invoke('cloudflare_get_all_agents'),

  /**
   * Get the current machine ID
   */
  getMachineId: () => invoke('get_machine_id'),

  // ========================================
  // Project Commands
  // ========================================

  /**
   * Discover local Git projects
   */
  discoverProjects: (maxDepth) => invoke('discover_projects', { maxDepth }),

  /**
   * Get detailed info about a project
   */
  getProjectInfo: (path) => invoke('get_project_info', { path }),

  /**
   * Pull latest changes
   */
  projectPull: (path) => invoke('project_pull', { path }),

  /**
   * Fetch from remote
   */
  projectFetch: (path) => invoke('project_fetch', { path }),

  /**
   * Checkout a branch
   */
  projectCheckout: (path, branch) => invoke('project_checkout', { path, branch }),

  /**
   * Create and checkout a new branch
   */
  projectCreateBranch: (path, branch) =>
    invoke('project_create_branch', { path, branch }),

  /**
   * Get all branches
   */
  projectGetBranches: (path) => invoke('project_get_branches', { path }),

  /**
   * Create a git worktree
   */
  projectCreateWorktree: (path, branch, worktreePath) =>
    invoke('project_create_worktree', { path, branch, worktreePath }),

  /**
   * Remove a git worktree
   */
  projectRemoveWorktree: (path, worktreePath) =>
    invoke('project_remove_worktree', { path, worktreePath }),

  /**
   * List git worktrees
   */
  projectListWorktrees: (path) => invoke('project_list_worktrees', { path }),

  // ========================================
  // Task Commands
  // ========================================

  /**
   * Get all background tasks
   */
  getTasks: () => invoke('get_tasks'),

  /**
   * Get a specific task
   */
  getTask: (taskId) => invoke('get_task', { taskId }),

  /**
   * Cancel a running task
   */
  cancelTask: (taskId) => invoke('cancel_task', { taskId }),

  /**
   * Clear completed tasks
   */
  clearCompletedTasks: () => invoke('clear_completed_tasks'),

  // ========================================
  // Utility Commands
  // ========================================

  /**
   * Open URL in default browser
   */
  openExternal: (url) => shellOpen(url),

  /**
   * Get app version
   */
  getAppVersion: () => invoke('get_app_version'),

  /**
   * Get app name
   */
  getAppName: () => invoke('get_app_name'),

  /**
   * Get platform info (os, arch, family)
   */
  getPlatformInfo: () => invoke('get_platform_info'),

  /**
   * Check if running in dev mode
   */
  isDevMode: () => invoke('is_dev_mode'),

  /**
   * Get app data directory path
   */
  getAppDataDir: () => invoke('get_app_data_dir'),

  /**
   * Get home directory path
   */
  getHomeDir: () => invoke('get_home_dir'),

  /**
   * Pick a directory with native dialog
   */
  pickDirectory: () => invoke('pick_directory'),

  /**
   * Pick a file with native dialog
   */
  pickFile: (filters) => invoke('pick_file', { filters }),

  /**
   * Save file dialog
   */
  saveFileDialog: (defaultName, filters) =>
    invoke('save_file_dialog', { defaultName, filters }),

  /**
   * Show a message dialog
   */
  showMessage: (title, message, kind) =>
    invoke('show_message', { title, message, kind }),

  /**
   * Show a confirmation dialog
   */
  showConfirm: (title, message) => invoke('show_confirm', { title, message }),

  // ========================================
  // Event Listeners
  // ========================================

  /**
   * Listen for agent refresh tick events
   */
  onRefreshTick: (callback) => listen('agents:refresh-tick', callback),

  /**
   * Listen for heartbeat tick events
   */
  onHeartbeatTick: (callback) => listen('cloudflare:heartbeat-tick', callback),
};

// Export for compatibility with existing code that might use destructured imports
export const {
  getAgents,
  getAgentDetails,
  startAgentSession,
  stopAgent,
  getSettings,
  setSettings,
  getTheme,
  setTheme,
  getRefreshInterval,
  setRefreshInterval,
  hasApiKey,
  setApiKey,
  deleteApiKey,
  isProviderEnabled,
  setProviderEnabled,
  getEnabledProviders,
  getProjects,
  addProject,
  removeProject,
  openExternal,
} = tauriAPI;

export default tauriAPI;
