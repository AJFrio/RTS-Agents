/**
 * Web settings surface — the storage-backed half of the web electronAPI
 * adapter: settings, API keys, filters, Cloudflare config, local path
 * management and local-only capability degradation. Extracted from
 * web-api.mjs so the composition root stays thin.
 */

const EMPTY_PATH_RESPONSE = () => ({ paths: [] });

export function createSettingsSurface(storage) {
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

  return {
    getSettings,

    async setApiKey(provider, key) {
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
  };
}

export default createSettingsSurface;