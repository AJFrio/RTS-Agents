/**
 * Web API adapter — browser implementation of the window.electronAPI surface.
 *
 * The desktop renderer talks to the Electron main process through
 * window.electronAPI (preload IPC). This module implements the same surface
 * for the Cloudflare Worker-served web build:
 *   - settings/filters/keys persist in localStorage (mobile-webapp compatible)
 *   - cloud providers, GitHub, Jira and Cloudflare KV go through the
 *     same-origin worker proxy (/api/<provider>/...)
 *   - local-only capabilities (filesystem, local CLIs, dialogs, app updates)
 *     degrade gracefully
 *
 * Contract tests: tests/unit/web-platform.verify.mjs
 */

import { createStorage } from './web-storage.mjs';

const API_KEY_PROVIDERS = new Set(['jules', 'cursor', 'codex', 'claude', 'github', 'jira', 'openrouter']);

const EMPTY_PATH_RESPONSE = () => ({ paths: [] });

function buildCounts(agents) {
  const counts = {
    antigravity: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    opencode: 0,
    total: agents.length,
  };
  for (const agent of agents) {
    if (counts[agent.provider] !== undefined) {
      counts[agent.provider] += 1;
    }
  }
  return counts;
}

export function createWebApi(options = {}) {
  const storage = options.storage || createStorage();
  const tickSubscribers = new Set();
  let revision = 0;
  let cachedAgents = [];

  function emitRefreshTick() {
    for (const cb of tickSubscribers) {
      try {
        cb();
      } catch (err) {
        console.error('refresh tick subscriber failed:', err);
      }
    }
  }

  async function getSettings() {
    const settings = storage.getSettings();
    const cloudflare = storage.getCloudflareConfig();
    const apiKeys = {
      jules: storage.hasApiKey('jules'),
      cursor: storage.hasApiKey('cursor'),
      codex: storage.hasApiKey('codex'),
      openrouter: storage.hasApiKey('openrouter'),
      claude: storage.hasApiKey('claude'),
      github: storage.hasApiKey('github'),
      jira: storage.hasApiKey('jira'),
      cloudflare: storage.hasCloudflareConfig(),
    };
    const emptyPaths = [];
    return {
      settings: {
        pollingInterval: settings.pollingInterval,
        autoPolling: settings.autoPolling,
        theme: settings.theme,
        displayMode: settings.displayMode,
        jiraBaseUrl: settings.jiraBaseUrl,
        selectedModel: settings.selectedModel,
        antigravityPaths: emptyPaths,
        claudePaths: emptyPaths,
        cursorPaths: emptyPaths,
        codexPaths: emptyPaths,
        opencodePaths: emptyPaths,
        githubPaths: emptyPaths,
      },
      apiKeys,
      jiraBaseUrl: settings.jiraBaseUrl,
      cloudflare: {
        configured: storage.hasCloudflareConfig(),
        accountId: cloudflare?.accountId || '',
        namespaceTitle: cloudflare?.namespaceTitle || 'rtsa',
      },
      antigravityInstalled: false,
      antigravityDefaultPath: '',
      antigravityPaths: emptyPaths,
      claudeCliInstalled: false,
      codexInstalled: false,
      opencodeInstalled: false,
      opencodeDefaultPath: '',
      claudeCloudConfigured: apiKeys.claude,
      claudeDefaultPath: '',
      claudePaths: emptyPaths,
      cursorPaths: emptyPaths,
      codexPaths: emptyPaths,
      opencodePaths: emptyPaths,
      githubPaths: emptyPaths,
      filters: storage.getFilters(),
      selectedModel: settings.selectedModel,
      localDeviceId: null,
    };
  }

  async function getAgents({ sinceRevision = 0, force = false } = {}) {
    if (!force && sinceRevision === revision) {
      return { unchanged: true, revision };
    }
    // Provider fetchers are wired up by the platform provider services
    // (src/renderer/platform/providers/*.mjs). Until configured, the web
    // runtime reports an empty, healthy agent list.
    const agents = [...cachedAgents];
    revision += 1;
    return {
      revision,
      full: true,
      agents,
      counts: buildCounts(agents),
      errors: [],
    };
  }

  return {
    // ------------------------------------------------------------------
    // Settings / config
    // ------------------------------------------------------------------
    getSettings,

    async setApiKey(provider, key) {
      if (!API_KEY_PROVIDERS.has(provider)) {
        return { success: false, error: 'Unknown provider' };
      }
      storage.setApiKey(provider, key);
      return { success: true };
    },

    async removeApiKey(provider) {
      storage.removeApiKey(provider);
      return { success: true };
    },

    async setJiraBaseUrl(url) {
      storage.setSettings({ jiraBaseUrl: url });
      return { success: true };
    },

    async testApiKey(provider) {
      return { success: false, error: `Testing ${provider} is not available on web yet` };
    },

    async setPolling(enabled, interval) {
      storage.setSettings({ autoPolling: enabled !== false, pollingInterval: interval });
      return { success: true };
    },

    async setTheme(theme) {
      storage.setSettings({ theme });
      return { success: true };
    },

    async setDisplayMode(mode) {
      storage.setSettings({ displayMode: mode });
      return { success: true };
    },

    async saveFilters(filters) {
      storage.setFilters(filters || {});
      return { success: true };
    },

    async setModel(model) {
      storage.setSettings({ selectedModel: model });
      return { success: true };
    },

    async setCloudflareConfig(accountId, apiToken, namespaceTitle) {
      storage.setCloudflareConfig({ accountId, apiToken, namespaceTitle });
      return { success: true };
    },

    async clearCloudflareConfig() {
      storage.removeCloudflareConfig();
      return { success: true };
    },

    async testCloudflare() {
      return { success: false, error: 'Cloudflare testing is not available on web yet' };
    },

    async listComputers() {
      return { success: true, configured: false, computers: [] };
    },

    async getQueueActivity() {
      return { success: true, configured: false, devices: [] };
    },

    async pushKeysToCloudflare() {
      return { success: false, error: 'Key sync is not available on web yet' };
    },

    async pullKeysFromCloudflare() {
      return { success: false, error: 'Key sync is not available on web yet' };
    },

    // ------------------------------------------------------------------
    // Local path management — desktop-only, degrade to empty
    // ------------------------------------------------------------------
    async addAntigravityPath() {
      return { success: true, paths: [] };
    },
    async removeAntigravityPath() {
      return { success: true, paths: [] };
    },
    async getAntigravityPaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async addClaudePath() {
      return { success: true, paths: [] };
    },
    async removeClaudePath() {
      return { success: true, paths: [] };
    },
    async getClaudePaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async addCursorPath() {
      return { success: true, paths: [] };
    },
    async removeCursorPath() {
      return { success: true, paths: [] };
    },
    async getCursorPaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async addCodexPath() {
      return { success: true, paths: [] };
    },
    async removeCodexPath() {
      return { success: true, paths: [] };
    },
    async getCodexPaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async addOpenCodePath() {
      return { success: true, paths: [] };
    },
    async removeOpenCodePath() {
      return { success: true, paths: [] };
    },
    async getOpenCodePaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async addGithubPath() {
      return { success: true, paths: [] };
    },
    async removeGithubPath() {
      return { success: true, paths: [] };
    },
    async getGithubPaths() {
      return EMPTY_PATH_RESPONSE();
    },
    async getAllProjectPaths() {
      return { paths: {} };
    },

    // ------------------------------------------------------------------
    // Local-only capabilities
    // ------------------------------------------------------------------
    async openExternal(url) {
      if (typeof window === 'undefined') return null;
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    },

    async openDirectory() {
      return null;
    },

    async updateApp() {
      return { success: false, error: 'Updating the app is desktop-only' };
    },

    async openOpenCodeSession() {
      return { success: false, error: 'OpenCode terminal is desktop-only' };
    },

    async getConnectionStatus() {
      return {};
    },

    // ------------------------------------------------------------------
    // Agents
    // ------------------------------------------------------------------
    getAgents,
    async getAgentDetails() {
      return { error: 'Agent details are not available on web yet' };
    },
    async getJulesAgentDetailsText() {
      return null;
    },
    async getJulesActivityMedia() {
      return null;
    },

    onRefreshTick(callback) {
      tickSubscribers.add(callback);
      return () => {
        tickSubscribers.delete(callback);
      };
    },

    _emitRefreshTick: emitRefreshTick,

    // ------------------------------------------------------------------
    // Tasks (provider dispatch wired in providers wave)
    // ------------------------------------------------------------------
    async createTask() {
      return { success: false, error: 'Task creation is not available on web yet' };
    },
    async sendMessage() {
      return { success: false, error: 'Messaging is not available on web yet' };
    },
    async orchestratorGetModels() {
      return [];
    },
    async orchestratorChat() {
      return { success: false, error: 'Orchestrator chat is not available on web yet' };
    },
    async getRepositories() {
      return { success: true, repositories: [] };
    },
    async getAllRepositories() {
      return {
        jules: [],
        cursor: [],
        antigravity: [],
        codex: [],
        'claude-cli': [],
        'claude-cloud': [],
        opencode: [],
      };
    },

    // ------------------------------------------------------------------
    // GitHub / Jira (wired through the worker proxy in providers wave)
    // ------------------------------------------------------------------
    github: new Proxy(
      {},
      {
        get() {
          return async () => ({ success: false, error: 'GitHub is not available on web yet' });
        },
      }
    ),
    jira: new Proxy(
      {},
      {
        get() {
          return async () => ({ success: false, error: 'Jira is not available on web yet' });
        },
      }
    ),

    // ------------------------------------------------------------------
    // Local projects — desktop-only
    // ------------------------------------------------------------------
    projects: {
      async createLocalRepo() {
        return { success: false, error: 'Local repos are desktop-only' };
      },
      async enqueueCreateRepo() {
        return { success: false, error: 'Repo creation is not available on web yet' };
      },
      async getLocalRepos() {
        return { success: true, repos: [] };
      },
      async getRepoFile() {
        return { success: false, error: 'Local files are desktop-only' };
      },
      async pullRepo() {
        return { success: false, error: 'Git pull is desktop-only' };
      },
    },

    platform: 'web',
    versions: {},
  };
}

export default createWebApi;
