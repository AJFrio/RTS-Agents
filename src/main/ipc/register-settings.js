const { ipcMain } = require('electron');
const { registerSettingsPathHandlers } = require('./register-settings-paths');

const API_KEY_PROVIDERS = new Set(['jules', 'cursor', 'codex', 'claude', 'github', 'jira', 'openrouter']);

function registerSettingsHandlers(deps) {
  const {
    configStore,
    julesService,
    cursorService,
    codexService,
    claudeService,
    openRouterService,
    githubService,
    jiraService,
    opencodeService,
    antigravityService,
    lifecycle
  } = deps;
  const {
    startPolling,
    stopPolling,
    invalidateAgentDiscovery,
    startDiscoveryWatchers
  } = lifecycle;
  const { getMainWindow } = deps;

ipcMain.handle('settings:get', async () => {
    const [antigravityInstalled, claudeCliInstalled, opencodeInstalled] = await Promise.all([
      antigravityService.isAntigravityInstalled(),
      claudeService.isClaudeInstalled(),
      opencodeService.isOpenCodeInstalled()
    ]);
    return {
      settings: configStore.getAllSettings(),
      apiKeys: {
        jules: configStore.hasApiKey('jules'),
        cursor: configStore.hasApiKey('cursor'),
        codex: configStore.hasApiKey('codex'),
        openrouter: configStore.hasApiKey('openrouter'),
        claude: configStore.hasApiKey('claude'),
        github: configStore.hasApiKey('github'),
        jira: configStore.hasApiKey('jira'),
        cloudflare: configStore.hasCloudflareConfig()
      },
      jiraBaseUrl: configStore.getJiraBaseUrl(),
      cloudflare: (() => {
        const cfg = configStore.getCloudflareConfig();
        return {
          configured: configStore.hasCloudflareConfig(),
          accountId: cfg?.accountId || '',
          namespaceTitle: cfg?.namespaceTitle || 'rtsa'
        };
      })(),
      antigravityInstalled,
      antigravityDefaultPath: antigravityService.getDefaultDataPath(),
      antigravityPaths: configStore.getAntigravityPaths(),
      claudeCliInstalled,
      opencodeInstalled,
      opencodeDefaultPath: opencodeService.getDefaultDataPath(),
      claudeCloudConfigured: configStore.hasApiKey('claude'),
      claudeDefaultPath: claudeService.getDefaultPath(),
      claudePaths: configStore.getClaudePaths(),
      cursorPaths: configStore.getCursorPaths(),
      codexPaths: configStore.getCodexPaths(),
      githubPaths: configStore.getGithubPaths(),
      filters: configStore.getFilters(),
      selectedModel: configStore.getSelectedModel(),
      localDeviceId: configStore.getOrCreateDeviceIdentity().id
    };
  });
  
  /**
   * Save API key
   */
ipcMain.handle('settings:set-api-key', async (event, { provider, key }) => {
    if (!API_KEY_PROVIDERS.has(provider)) {
      return { success: false, error: 'Unknown provider' };
    }

    invalidateAgentDiscovery();
    configStore.setApiKey(provider, key);
    
    // Update service with new key
    if (provider === 'jules') {
      julesService.setApiKey(key);
    } else if (provider === 'cursor') {
      cursorService.setApiKey(key);
    } else if (provider === 'codex') {
      codexService.setApiKey(key);
      // Restore tracked threads from config
      const trackedThreads = configStore.getCodexThreads();
      codexService.setTrackedThreads(trackedThreads);
    } else if (provider === 'claude') {
      claudeService.setApiKey(key);
      // Restore tracked conversations from config
      const trackedConversations = configStore.getClaudeConversations();
      claudeService.setTrackedConversations(trackedConversations);
    } else if (provider === 'github') {
      githubService.setApiKey(key);
    } else if (provider === 'openrouter') {
      openRouterService.setApiKey(key);
    }
    
    return { success: true };
  });
  
ipcMain.handle('settings:set-jira-base-url', async (event, { url }) => {
    configStore.setJiraBaseUrl(url);
    return { success: true };
  });
ipcMain.handle('settings:test-api-key', async (event, { provider }) => {
    try {
      if (!API_KEY_PROVIDERS.has(provider)) {
        return { success: false, error: 'Unknown provider' };
      }

      if (provider === 'jules') {
        return await julesService.testConnection();
      } else if (provider === 'cursor') {
        return await cursorService.testConnection();
      } else if (provider === 'codex') {
        return await codexService.testConnection();
      } else if (provider === 'claude') {
        return await claudeService.testConnection();
      } else if (provider === 'github') {
        return await githubService.testConnection();
      } else if (provider === 'jira') {
        return await jiraService.testConnection();
      } else if (provider === 'openrouter') {
        return await openRouterService.testConnection();
      }
      return { success: false, error: 'Unknown provider' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
  /**
   * Remove API key (disconnect)
   */
ipcMain.handle('settings:remove-api-key', async (event, { provider }) => {
    if (!API_KEY_PROVIDERS.has(provider)) {
      return { success: false, error: 'Unknown provider' };
    }

    invalidateAgentDiscovery();
    configStore.removeApiKey(provider);
    
    // Clear the API key from the service
    if (provider === 'jules') {
      julesService.setApiKey(null);
    } else if (provider === 'cursor') {
      cursorService.setApiKey(null);
    } else if (provider === 'codex') {
      codexService.setApiKey(null);
      // Clear tracked threads
      configStore.setCodexThreads([]);
      codexService.setTrackedThreads([]);
    } else if (provider === 'claude') {
      claudeService.setApiKey(null);
      // Clear tracked conversations
      configStore.setClaudeConversations([]);
      claudeService.setTrackedConversations([]);
    } else if (provider === 'github') {
      githubService.setApiKey(null);
    } else if (provider === 'openrouter') {
      openRouterService.setApiKey(null);
    }
    
    return { success: true };
  });
ipcMain.handle('settings:set-polling', async (event, { enabled, interval }) => {
    if (typeof enabled === 'boolean') {
      configStore.setAutoPolling(enabled);
    }
    if (typeof interval === 'number') {
      configStore.setPollingInterval(interval);
    }
    
    invalidateAgentDiscovery();
    startDiscoveryWatchers();

    // Restart polling with new settings
    if (configStore.isAutoPollingEnabled()) {
      startPolling();
    } else {
      stopPolling();
    }
    
    return { success: true };
  });
  
  /**
   * Set application theme
   */
ipcMain.handle('settings:set-theme', async (event, { theme }) => {
    configStore.setSetting('theme', theme);
    return { success: true };
  });
  
  /**
   * Set display mode
   */
ipcMain.handle('settings:set-display-mode', async (event, { mode }) => {
    configStore.setDisplayMode(mode);
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      getMainWindow().setFullScreen(mode === 'fullscreen');
    }
    return { success: true };
  });
  
  /**
   * Save filters
   */
ipcMain.handle('settings:save-filters', async (event, { filters }) => {
    configStore.setFilters(filters);
    return { success: true };
  });
  
  /**
   * Set selected model
   */
ipcMain.handle('settings:set-model', async (event, { model }) => {
    configStore.setSelectedModel(model);
    return { success: true };
  });
  
  registerSettingsPathHandlers(deps);
}

module.exports = { registerSettingsHandlers };
