/**
 * Tauri API Bridge
 *
 * This module provides a unified interface to Tauri commands,
 * matching the Electron API interface expected by app.js.
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
  return window.__TAURI_INTERNALS__.listen(event, (e) => callback(e.payload));
}

// Helper to open URLs using shell plugin
async function shellOpen(url) {
  return invoke('plugin:shell|open', { path: url });
}

export const tauriAPI = {
  // ========================================
  // Core Agent Commands
  // ========================================

  /**
   * Get all agents from all enabled providers
   * Adapts Rust response to match Electron API format:
   * { agents: [], counts: { total, gemini, jules, etc }, errors: [] }
   */
  getAgents: async () => {
    const result = await invoke('get_agents');
    // Adapt response to expected format
    const counts = { total: result.total || 0 };
    const agents = result.agents || [];

    // Count by provider
    for (const agent of agents) {
      const provider = agent.provider?.toLowerCase() || 'unknown';
      counts[provider] = (counts[provider] || 0) + 1;
    }

    return {
      agents: agents.map(a => ({
        ...a,
        provider: a.provider?.toLowerCase(),
        rawId: a.raw_id || a.id,
        createdAt: a.created_at,
        updatedAt: a.last_updated,
      })),
      counts,
      errors: []
    };
  },

  /**
   * Get detailed information about a specific agent
   */
  getAgentDetails: (provider, rawId, filePath) =>
    invoke('get_agent_details', { provider, rawId, filePath }),

  /**
   * Send a message to an agent
   * TODO: Implement in Rust backend
   */
  sendMessage: async (provider, rawId, message) => {
    console.warn('sendMessage not yet implemented in Rust backend');
    return { success: false, error: 'Not implemented' };
  },

  /**
   * Create a new task/agent
   * Maps to start_agent_session in Rust
   */
  createTask: async (service, options) => {
    try {
      const result = await invoke('start_agent_session', {
        provider: service,
        prompt: options.prompt,
        projectPath: options.projectPath || options.directory,
        repository: options.repository || options.repo,
        branch: options.branch,
        autoCreatePr: options.autoCreatePr
      });
      return { success: true, ...result };
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  },

  /**
   * Get repositories for a service
   * TODO: Implement properly per provider
   */
  getRepositories: async (service) => {
    // For now, return projects from config
    try {
      const projects = await invoke('get_projects');
      return {
        success: true,
        repositories: projects.map(p => ({
          id: p.id,
          name: p.name,
          url: p.github_repo || p.path,
          displayName: p.name.toUpperCase(),
          path: p.path
        }))
      };
    } catch (e) {
      return { success: false, repositories: [], error: e.toString() };
    }
  },

  // ========================================
  // Settings Commands
  // ========================================

  /**
   * Get all application settings
   * Adapts Rust response to match Electron API format
   */
  getSettings: async () => {
    const settings = await invoke('get_settings');

    // Check for API keys
    const [hasGithub, hasJules, hasCursor, hasCodex, hasClaude, hasJira] = await Promise.all([
      invoke('has_api_key', { provider: 'github' }).catch(() => false),
      invoke('has_api_key', { provider: 'jules' }).catch(() => false),
      invoke('has_api_key', { provider: 'cursor' }).catch(() => false),
      invoke('has_api_key', { provider: 'codex' }).catch(() => false),
      invoke('has_api_key', { provider: 'claude' }).catch(() => false),
      invoke('has_api_key', { provider: 'jira' }).catch(() => false),
    ]);

    // Check if CLIs are installed (basic check via path existence)
    // TODO: Implement proper CLI detection in Rust
    const geminiInstalled = settings.gemini_enabled;
    const claudeCliInstalled = settings.claude_enabled;

    return {
      settings: {
        theme: settings.theme || 'system',
        pollingInterval: (settings.refresh_interval || 30) * 1000, // Convert to ms
        autoPolling: true,
        geminiPaths: [],
        claudePaths: [],
        cursorPaths: [],
        codexPaths: [],
      },
      githubPaths: settings.projects?.map(p => p.path) || [],
      apiKeys: {
        github: hasGithub,
        jules: hasJules,
        cursor: hasCursor,
        codex: hasCodex,
        claude: hasClaude,
        jira: hasJira,
      },
      geminiInstalled,
      claudeCliInstalled,
    };
  },

  /**
   * Get connection status for all providers
   */
  getConnectionStatus: async () => {
    // Check which providers have valid API keys
    const providers = ['github', 'jules', 'cursor', 'codex', 'claude', 'jira'];
    const status = {};

    for (const provider of providers) {
      try {
        const hasKey = await invoke('has_api_key', { provider });
        status[provider] = { connected: hasKey };
      } catch {
        status[provider] = { connected: false };
      }
    }

    // Add CLI providers
    status['gemini'] = { connected: true }; // Assume available if enabled
    status['claude-cli'] = { connected: true };
    status['claude-cloud'] = status.claude;

    return status;
  },

  /**
   * Set theme (system, light, dark)
   */
  setTheme: (theme) => invoke('set_theme', { theme }),

  /**
   * Set display mode
   * TODO: Implement in Rust backend
   */
  setDisplayMode: async (mode) => {
    console.warn('setDisplayMode not yet implemented');
  },

  /**
   * Set polling configuration
   */
  setPolling: async (enabled, interval) => {
    if (interval) {
      await invoke('set_refresh_interval', { interval: Math.floor(interval / 1000) });
    }
  },

  /**
   * Save filters to settings
   * TODO: Implement in Rust backend
   */
  saveFilters: async (filters) => {
    console.warn('saveFilters not yet implemented');
  },

  /**
   * Set API key for a provider
   */
  setApiKey: (provider, apiKey) => invoke('set_api_key', { provider, apiKey }),

  /**
   * Test API key for a provider
   * TODO: Implement proper API testing in Rust
   */
  testApiKey: async (provider) => {
    try {
      const hasKey = await invoke('has_api_key', { provider });
      return { success: hasKey };
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  },

  /**
   * Remove API key for a provider
   */
  removeApiKey: (provider) => invoke('delete_api_key', { provider }),

  /**
   * Set Jira base URL
   */
  setJiraBaseUrl: async (url) => {
    const [, email] = await invoke('get_jira_config');
    await invoke('set_jira_config', { baseUrl: url, email });
  },

  /**
   * Set Cloudflare config
   */
  setCloudflareConfig: async (accountId, apiToken) => {
    await invoke('set_api_key', { provider: 'cloudflare', apiKey: apiToken });
    await invoke('set_cloudflare_config', { accountId, namespaceId: null });
  },

  /**
   * Test Cloudflare connection
   */
  testCloudflare: async () => {
    try {
      await invoke('cloudflare_kv_list', { prefix: '', limit: 1 });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.toString() };
    }
  },

  /**
   * Clear Cloudflare config
   */
  clearCloudflareConfig: async () => {
    await invoke('delete_api_key', { provider: 'cloudflare' });
    await invoke('set_cloudflare_config', { accountId: null, namespaceId: null });
  },

  /**
   * Push keys to Cloudflare KV
   * TODO: Implement in Rust backend
   */
  pushKeysToCloudflare: async () => {
    console.warn('pushKeysToCloudflare not yet implemented');
    return { success: false, error: 'Not implemented' };
  },

  /**
   * Pull keys from Cloudflare KV
   * TODO: Implement in Rust backend
   */
  pullKeysFromCloudflare: async () => {
    console.warn('pullKeysFromCloudflare not yet implemented');
    return { success: false, error: 'Not implemented' };
  },

  // ========================================
  // Path Management Commands
  // TODO: Implement these in Rust backend
  // ========================================

  addGeminiPath: async (path) => {
    console.warn('addGeminiPath not yet implemented');
    return { success: true, paths: [path] };
  },
  removeGeminiPath: async (path) => {
    console.warn('removeGeminiPath not yet implemented');
    return { success: true, paths: [] };
  },
  addClaudePath: async (path) => {
    console.warn('addClaudePath not yet implemented');
    return { success: true, paths: [path] };
  },
  removeClaudePath: async (path) => {
    console.warn('removeClaudePath not yet implemented');
    return { success: true, paths: [] };
  },
  addCursorPath: async (path) => {
    console.warn('addCursorPath not yet implemented');
    return { success: true, paths: [path] };
  },
  removeCursorPath: async (path) => {
    console.warn('removeCursorPath not yet implemented');
    return { success: true, paths: [] };
  },
  addCodexPath: async (path) => {
    console.warn('addCodexPath not yet implemented');
    return { success: true, paths: [path] };
  },
  removeCodexPath: async (path) => {
    console.warn('removeCodexPath not yet implemented');
    return { success: true, paths: [] };
  },
  addGithubPath: async (path) => {
    // Add as a project
    const id = 'project-' + Date.now();
    const name = path.split('/').pop() || path;
    await invoke('add_project', { project: { id, name, path } });
    const projects = await invoke('get_projects');
    return { success: true, paths: projects.map(p => p.path) };
  },
  removeGithubPath: async (path) => {
    const projects = await invoke('get_projects');
    const project = projects.find(p => p.path === path);
    if (project) {
      await invoke('remove_project', { projectId: project.id });
    }
    const remaining = await invoke('get_projects');
    return { success: true, paths: remaining.map(p => p.path) };
  },

  // ========================================
  // Multi-device / Cloudflare Commands
  // ========================================

  /**
   * List computers/devices from Cloudflare KV
   */
  listComputers: async () => {
    try {
      const heartbeats = await invoke('cloudflare_get_heartbeats');
      return {
        success: true,
        computers: heartbeats || [],
        configured: true
      };
    } catch (e) {
      return { success: false, computers: [], configured: false };
    }
  },

  /**
   * Update app (git pull and restart)
   * TODO: Implement in Rust backend
   */
  updateApp: async () => {
    console.warn('updateApp not yet implemented');
  },

  // ========================================
  // Directory Dialog
  // ========================================

  /**
   * Open directory picker dialog
   */
  openDirectory: () => invoke('pick_directory'),

  // ========================================
  // GitHub Commands (nested for compatibility)
  // ========================================

  github: {
    getRepos: async () => {
      try {
        const repos = await invoke('github_list_repos');
        return { success: true, repos };
      } catch (e) {
        return { success: false, repos: [], error: e.toString() };
      }
    },
    getBranches: async (owner, repo) => {
      try {
        const branches = await invoke('github_list_branches', { owner, repo });
        return { success: true, branches };
      } catch (e) {
        return { success: false, branches: [], error: e.toString() };
      }
    },
    getOwners: async () => {
      try {
        const user = await invoke('github_get_user');
        return { success: true, owners: [user] };
      } catch (e) {
        return { success: false, owners: [], error: e.toString() };
      }
    },
    getPrs: async (owner, repo, prState) => {
      try {
        const prs = await invoke('github_list_prs', { owner, repo, prState: prState || 'open' });
        return { success: true, prs };
      } catch (e) {
        return { success: false, prs: [], error: e.toString() };
      }
    },
    getPrDetails: async (owner, repo, number) => {
      try {
        const pr = await invoke('github_get_pr', { owner, repo, prNumber: number });
        return { success: true, pr };
      } catch (e) {
        return { success: false, error: e.toString() };
      }
    },
    mergePr: async (owner, repo, number, method) => {
      try {
        await invoke('github_merge_pr', { owner, repo, prNumber: number, mergeMethod: method || 'merge' });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.toString() };
      }
    },
    closePr: async (owner, repo, number) => {
      // TODO: Implement close PR in Rust
      console.warn('closePr not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
    markPrReadyForReview: async (nodeId) => {
      // TODO: Implement in Rust (requires GraphQL)
      console.warn('markPrReadyForReview not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
    createRepo: async (options) => {
      // TODO: Implement create repo in Rust
      console.warn('createRepo not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
  },

  // ========================================
  // Jira Commands (nested for compatibility)
  // ========================================

  jira: {
    getBoards: async () => {
      try {
        const projects = await invoke('jira_get_projects');
        // Adapt projects as boards
        return {
          success: true,
          boards: projects.map(p => ({
            id: p.id || p.key,
            name: p.name,
            type: 'scrum'
          }))
        };
      } catch (e) {
        return { success: false, boards: [], error: e.toString() };
      }
    },
    getSprints: async (boardId) => {
      // TODO: Implement sprints in Rust
      console.warn('getSprints not yet implemented');
      return { success: true, sprints: [] };
    },
    getSprintIssues: async (sprintId) => {
      // TODO: Implement sprint issues in Rust
      console.warn('getSprintIssues not yet implemented');
      return { success: true, issues: [] };
    },
    getBacklogIssues: async (boardId) => {
      try {
        const issues = await invoke('jira_get_project_issues', { projectKey: boardId });
        return { success: true, issues };
      } catch (e) {
        return { success: false, issues: [], error: e.toString() };
      }
    },
    getIssue: async (issueKey) => {
      try {
        const issue = await invoke('jira_get_issue', { issueKey });
        return { success: true, issue };
      } catch (e) {
        return { success: false, error: e.toString() };
      }
    },
    getIssueComments: async (issueKey) => {
      // TODO: Implement issue comments in Rust
      console.warn('getIssueComments not yet implemented');
      return { success: true, comments: [] };
    },
  },

  // ========================================
  // Projects Commands (nested for compatibility)
  // ========================================

  projects: {
    getLocalRepos: async () => {
      try {
        const projects = await invoke('get_projects');
        return {
          success: true,
          repos: projects.map(p => ({
            id: p.id,
            name: p.name,
            path: p.path,
            url: p.github_repo
          }))
        };
      } catch (e) {
        return { success: false, repos: [], error: e.toString() };
      }
    },
    createLocalRepo: async (options) => {
      // TODO: Implement local repo creation
      console.warn('createLocalRepo not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
    enqueueCreateRepo: async (options) => {
      // TODO: Implement remote repo creation queue
      console.warn('enqueueCreateRepo not yet implemented');
      return { success: false, error: 'Not implemented' };
    },
    pullRepo: async (path) => {
      try {
        await invoke('project_pull', { path });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.toString() };
      }
    },
  },

  // ========================================
  // Utility Commands
  // ========================================

  /**
   * Open URL in default browser
   */
  openExternal: (url) => shellOpen(url),

  /**
   * Listen for agent refresh tick events
   */
  onRefreshTick: (callback) => listen('agents:refresh-tick', callback),

  /**
   * Get app version
   */
  getAppVersion: () => invoke('get_app_version'),

  /**
   * Get platform info
   */
  getPlatformInfo: () => invoke('get_platform_info'),
};

export default tauriAPI;
