const { ipcMain } = require('electron');
const { registerSettingsPathHandlers } = require('./register-settings-paths');

const API_KEY_PROVIDERS = new Set([
  'jules',
  'cursor',
  'claude',
  'github',
  'jira',
  'openrouter',
]);

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
    lifecycle,
    mcpServerService,
  } = deps;
  const { startPolling, stopPolling, invalidateAgentDiscovery, startDiscoveryWatchers } = lifecycle;
  const { getMainWindow } = deps;

  ipcMain.handle('settings:get', async () => {
    const [antigravityInstalled, claudeCliInstalled, codexInstalled, opencodeInstalled, cursorCliInstalled] =
      await Promise.all([
        antigravityService.isAntigravityInstalled(),
        claudeService.isClaudeInstalled(),
        codexService.isCodexInstalled(),
        opencodeService.isOpenCodeInstalled(),
        Promise.resolve(cursorService.isCursorCliAvailable()),
      ]);
    return {
      settings: configStore.getAllSettings(),
      apiKeys: {
        jules: configStore.hasApiKey('jules'),
        cursor: configStore.hasApiKey('cursor'),
        openrouter: configStore.hasApiKey('openrouter'),
        claude: configStore.hasApiKey('claude'),
        github: configStore.hasApiKey('github'),
        jira: configStore.hasApiKey('jira'),
        cloudflare: configStore.hasCloudflareConfig(),
      },
      jiraBaseUrl: configStore.getJiraBaseUrl(),
      cloudflare: (() => {
        const cfg = configStore.getCloudflareConfig();
        return {
          configured: configStore.hasCloudflareConfig(),
          accountId: cfg?.accountId || '',
          namespaceTitle: cfg?.namespaceTitle || 'rtsa',
        };
      })(),
      antigravityInstalled,
      antigravityDefaultPath: antigravityService.getDefaultDataPath(),
      antigravityPaths: configStore.getAntigravityPaths(),
      claudeCliInstalled,
      codexInstalled,
      opencodeInstalled,
      opencodeDefaultPath: opencodeService.getDefaultDataPath(),
      claudeCloudConfigured: configStore.hasApiKey('claude'),
      claudeDefaultPath: claudeService.getDefaultPath(),
      claudePaths: configStore.getClaudePaths(),
      cursorCliInstalled,
      cursorPaths: configStore.getCursorPaths(),
      codexPaths: configStore.getCodexPaths(),
      opencodePaths: configStore.getOpenCodePaths(),
      githubPaths: configStore.getGithubPaths(),
      filters: configStore.getFilters(),
      selectedModel: configStore.getSelectedModel(),
      localDeviceId: configStore.getOrCreateDeviceIdentity().id,
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

  ipcMain.handle('mcp:get-info', async () => {
    return {
      status: mcpServerService.status(),
      token: configStore.getOrCreateMcpToken(),
    };
  });

  ipcMain.handle('mcp:set-config', async (event, { enabled, host, port }) => {
    const next = configStore.setMcpConfig({ enabled, host, port });
    const status = mcpServerService.status();
    const shouldRun = next.enabled;
    if (shouldRun && !status.running) {
      await mcpServerService.start(deps);
    } else if (!shouldRun && status.running) {
      await mcpServerService.stop();
    } else if (
      shouldRun &&
      status.running &&
      (status.host !== next.host || status.port !== next.port)
    ) {
      await mcpServerService.stop();
      await mcpServerService.start(deps);
    }
    return { success: true, status: mcpServerService.status() };
  });

  ipcMain.handle('mcp:regenerate-token', async () => {
    const token = configStore.rotateMcpToken();
    return { success: true, token };
  });

  registerSettingsPathHandlers(deps);
}

module.exports = { registerSettingsHandlers };
