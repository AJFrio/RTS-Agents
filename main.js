const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// Services
const configStore = require('./src/main/services/config-store');
const geminiService = require('./src/main/services/gemini-service');
const julesService = require('./src/main/services/jules-service');
const cursorService = require('./src/main/services/cursor-service');
const codexService = require('./src/main/services/codex-service');
const claudeService = require('./src/main/services/claude-service');
const cliProcessManager = require('./src/main/services/cli-process-manager');

let mainWindow;
let pollingInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('index.html');
  
  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    initializeServices();
    startPollingIfEnabled();
    
    // Set main window reference for CLI process manager
    cliProcessManager.setMainWindow(mainWindow);
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Initialize services with stored API keys
 */
function initializeServices() {
  const julesKey = configStore.getApiKey('jules');
  const cursorKey = configStore.getApiKey('cursor');
  const codexKey = configStore.getApiKey('codex');
  const claudeKey = configStore.getApiKey('claude');
  
  if (julesKey) {
    julesService.setApiKey(julesKey);
  }
  if (cursorKey) {
    cursorService.setApiKey(cursorKey);
  }
  if (codexKey) {
    codexService.setApiKey(codexKey);
    // Restore tracked threads from config
    const trackedThreads = configStore.getCodexThreads();
    codexService.setTrackedThreads(trackedThreads);
  }
  if (claudeKey) {
    claudeService.setApiKey(claudeKey);
    // Restore tracked conversations from config
    const trackedConversations = configStore.getClaudeConversations();
    claudeService.setTrackedConversations(trackedConversations);
  }
}

/**
 * Start polling if enabled in settings
 */
function startPollingIfEnabled() {
  if (configStore.isAutoPollingEnabled()) {
    startPolling();
  }
}

/**
 * Start the polling interval
 */
function startPolling() {
  stopPolling(); // Clear any existing interval
  
  const interval = configStore.getPollingInterval();
  pollingInterval = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agents:refresh-tick');
    }
  }, interval);
}

/**
 * Stop the polling interval
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ============================================
// IPC Handlers - Agents
// ============================================

/**
 * Get all agents from all providers
 */
ipcMain.handle('agents:get-all', async () => {
  const results = {
    gemini: [],
    jules: [],
    cursor: [],
    codex: [],
    'claude-cli': [],
    'claude-cloud': [],
    errors: []
  };

  // Fetch from all providers in parallel
  const allProjectPaths = configStore.getAllProjectPaths();
  
  // Claude CLI (local) and Claude Cloud (API) are separate
  const claudeCliAvailable = claudeService.isClaudeInstalled();
  const claudeCloudAvailable = configStore.hasApiKey('claude');
  
  const [geminiResult, julesResult, cursorResult, codexResult, claudeCliResult, claudeCloudResult] = await Promise.allSettled([
    geminiService.getAllAgents(allProjectPaths),
    configStore.hasApiKey('jules') ? julesService.getAllAgents() : Promise.resolve([]),
    configStore.hasApiKey('cursor') ? cursorService.getAllAgents() : Promise.resolve([]),
    configStore.hasApiKey('codex') ? codexService.getAllAgents() : Promise.resolve([]),
    claudeCliAvailable ? claudeService.getAllLocalSessions(allProjectPaths) : Promise.resolve([]),
    claudeCloudAvailable ? claudeService.getAllCloudConversations() : Promise.resolve([])
  ]);

  if (geminiResult.status === 'fulfilled') {
    results.gemini = geminiResult.value;
  } else {
    results.errors.push({ provider: 'gemini', error: geminiResult.reason?.message || 'Unknown error' });
  }

  if (julesResult.status === 'fulfilled') {
    results.jules = julesResult.value;
  } else if (configStore.hasApiKey('jules')) {
    results.errors.push({ provider: 'jules', error: julesResult.reason?.message || 'Unknown error' });
  }

  if (cursorResult.status === 'fulfilled') {
    results.cursor = cursorResult.value;
  } else if (configStore.hasApiKey('cursor')) {
    results.errors.push({ provider: 'cursor', error: cursorResult.reason?.message || 'Unknown error' });
  }

  if (codexResult.status === 'fulfilled') {
    results.codex = codexResult.value;
  } else if (configStore.hasApiKey('codex')) {
    results.errors.push({ provider: 'codex', error: codexResult.reason?.message || 'Unknown error' });
  }

  if (claudeCliResult.status === 'fulfilled') {
    // Tag CLI sessions with the correct provider
    results['claude-cli'] = claudeCliResult.value.map(agent => ({ ...agent, provider: 'claude-cli' }));
  } else if (claudeCliAvailable) {
    results.errors.push({ provider: 'claude-cli', error: claudeCliResult.reason?.message || 'Unknown error' });
  }

  if (claudeCloudResult.status === 'fulfilled') {
    // Tag cloud sessions with the correct provider
    results['claude-cloud'] = claudeCloudResult.value.map(agent => ({ ...agent, provider: 'claude-cloud' }));
  } else if (claudeCloudAvailable) {
    results.errors.push({ provider: 'claude-cloud', error: claudeCloudResult.reason?.message || 'Unknown error' });
  }

  // Combine and sort all agents by date
  const allAgents = [...results.gemini, ...results.jules, ...results.cursor, ...results.codex, ...results['claude-cli'], ...results['claude-cloud']]
    .sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });

  return {
    agents: allAgents,
    errors: results.errors,
    counts: {
      gemini: results.gemini.length,
      jules: results.jules.length,
      cursor: results.cursor.length,
      codex: results.codex.length,
      'claude-cli': results['claude-cli'].length,
      'claude-cloud': results['claude-cloud'].length,
      total: allAgents.length
    }
  };
});

/**
 * Get details for a specific agent
 */
ipcMain.handle('agents:get-details', async (event, { provider, rawId, filePath }) => {
  try {
    switch (provider) {
      case 'gemini':
        return await geminiService.getSessionDetails(filePath);
      case 'jules':
        return await julesService.getAgentDetails(rawId);
      case 'cursor':
        return await cursorService.getAgentDetails(rawId);
      case 'codex':
        return await codexService.getAgentDetails(rawId);
      case 'claude':
      case 'claude-cli':
      case 'claude-cloud':
        return await claudeService.getAgentDetails(rawId, filePath);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (err) {
    console.error(`Error getting agent details:`, err);
    throw err;
  }
});

// ============================================
// IPC Handlers - Settings
// ============================================

/**
 * Get all settings and API key status
 */
ipcMain.handle('settings:get', async () => {
  return {
    settings: configStore.getAllSettings(),
    apiKeys: {
      jules: configStore.hasApiKey('jules'),
      cursor: configStore.hasApiKey('cursor'),
      codex: configStore.hasApiKey('codex'),
      claude: configStore.hasApiKey('claude')  // Keep for backward compatibility
    },
    geminiInstalled: geminiService.isGeminiInstalled(),
    geminiDefaultPath: geminiService.getDefaultPath(),
    claudeCliInstalled: claudeService.isClaudeInstalled(),
    claudeCloudConfigured: configStore.hasApiKey('claude'),
    claudeDefaultPath: claudeService.getDefaultPath(),
    githubPaths: configStore.getGithubPaths()
  };
});

/**
 * Save API key
 */
ipcMain.handle('settings:set-api-key', async (event, { provider, key }) => {
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
  }
  
  return { success: true };
});

/**
 * Test API key connection
 */
ipcMain.handle('settings:test-api-key', async (event, { provider }) => {
  try {
    if (provider === 'jules') {
      return await julesService.testConnection();
    } else if (provider === 'cursor') {
      return await cursorService.testConnection();
    } else if (provider === 'codex') {
      return await codexService.testConnection();
    } else if (provider === 'claude') {
      return await claudeService.testConnection();
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
  }
  
  return { success: true };
});

/**
 * Update polling settings
 */
ipcMain.handle('settings:set-polling', async (event, { enabled, interval }) => {
  if (typeof enabled === 'boolean') {
    configStore.setAutoPolling(enabled);
  }
  if (typeof interval === 'number') {
    configStore.setPollingInterval(interval);
  }
  
  // Restart polling with new settings
  if (configStore.isAutoPollingEnabled()) {
    startPolling();
  } else {
    stopPolling();
  }
  
  return { success: true };
});

/**
 * Add Gemini project path
 */
ipcMain.handle('settings:add-gemini-path', async (event, { path: geminiPath }) => {
  const paths = configStore.addGeminiPath(geminiPath);
  return { success: true, paths };
});

/**
 * Remove Gemini project path
 */
ipcMain.handle('settings:remove-gemini-path', async (event, { path: geminiPath }) => {
  const paths = configStore.removeGeminiPath(geminiPath);
  return { success: true, paths };
});

/**
 * Get Gemini project paths
 */
ipcMain.handle('settings:get-gemini-paths', async () => {
  return {
    paths: configStore.getGeminiPaths(),
    defaultPath: geminiService.getDefaultPath(),
    installed: geminiService.isGeminiInstalled()
  };
});

/**
 * Add GitHub repository path
 */
ipcMain.handle('settings:add-github-path', async (event, { path: githubPath }) => {
  const paths = configStore.addGithubPath(githubPath);
  return { success: true, paths };
});

/**
 * Remove GitHub repository path
 */
ipcMain.handle('settings:remove-github-path', async (event, { path: githubPath }) => {
  const paths = configStore.removeGithubPath(githubPath);
  return { success: true, paths };
});

/**
 * Get GitHub repository paths
 */
ipcMain.handle('settings:get-github-paths', async () => {
  return {
    paths: configStore.getGithubPaths()
  };
});

/**
 * Get all project paths (combined Gemini + GitHub paths)
 */
ipcMain.handle('settings:get-all-project-paths', async () => {
  return {
    paths: configStore.getAllProjectPaths(),
    geminiPaths: configStore.getGeminiPaths(),
    githubPaths: configStore.getGithubPaths()
  };
});

// ============================================
// IPC Handlers - Utilities
// ============================================

/**
 * Open external URL in browser
 */
ipcMain.handle('utils:open-external', async (event, { url }) => {
  await shell.openExternal(url);
  return { success: true };
});

/**
 * Get provider connection status
 */
ipcMain.handle('utils:get-status', async () => {
  const [julesStatus, cursorStatus, codexStatus, claudeCloudStatus] = await Promise.allSettled([
    configStore.hasApiKey('jules') ? julesService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('cursor') ? cursorService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('codex') ? codexService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('claude') ? claudeService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' })
  ]);

  // Claude CLI status: connected if CLI is installed
  const claudeCliInstalled = claudeService.isClaudeInstalled();
  // Claude Cloud status: connected if API key is valid
  const claudeCloudValid = claudeCloudStatus.status === 'fulfilled' && claudeCloudStatus.value.success;
  
  return {
    gemini: {
      connected: geminiService.isGeminiInstalled(),
      error: geminiService.isGeminiInstalled() ? null : 'Gemini CLI not found'
    },
    jules: julesStatus.status === 'fulfilled' ? julesStatus.value : { success: false, error: julesStatus.reason?.message },
    cursor: cursorStatus.status === 'fulfilled' ? cursorStatus.value : { success: false, error: cursorStatus.reason?.message },
    codex: codexStatus.status === 'fulfilled' ? codexStatus.value : { success: false, error: codexStatus.reason?.message },
    'claude-cli': {
      success: claudeCliInstalled,
      connected: claudeCliInstalled,
      error: claudeCliInstalled ? null : 'Claude CLI not installed'
    },
    'claude-cloud': {
      success: claudeCloudValid,
      connected: claudeCloudValid,
      error: claudeCloudValid ? null : (configStore.hasApiKey('claude') ? 'API key invalid' : 'Not configured')
    }
  };
});

// ============================================
// IPC Handlers - Task Creation
// ============================================

/**
 * Get available repositories for a specific provider
 */
ipcMain.handle('repos:get', async (event, { provider }) => {
  try {
    switch (provider) {
      case 'jules':
        if (!configStore.hasApiKey('jules')) {
          return { success: false, error: 'Jules API key not configured', repositories: [] };
        }
        const julesSources = await julesService.getAllSources();
        return { success: true, repositories: julesSources };

      case 'cursor':
        if (!configStore.hasApiKey('cursor')) {
          return { success: false, error: 'Cursor API key not configured', repositories: [] };
        }
        const cursorRepos = await cursorService.getAllRepositories();
        return { success: true, repositories: cursorRepos };

      case 'gemini':
        if (!geminiService.isGeminiInstalled()) {
          return { success: false, error: 'Gemini CLI not installed', repositories: [] };
        }
        const geminiProjectPaths = configStore.getAllProjectPaths();
        const geminiProjects = await geminiService.getAvailableProjects(geminiProjectPaths);
        return { success: true, repositories: geminiProjects };

      case 'codex':
        if (!configStore.hasApiKey('codex')) {
          return { success: false, error: 'OpenAI API key not configured', repositories: [] };
        }
        const codexProjects = await codexService.getAvailableProjects();
        return { success: true, repositories: codexProjects };

      case 'claude-cli':
        if (!claudeService.isClaudeInstalled()) {
          return { success: false, error: 'Claude CLI not installed', repositories: [] };
        }
        const claudeCliPaths = configStore.getAllProjectPaths(); // Use all project paths for scanning
        const claudeCliProjects = await claudeService.getAvailableProjects(claudeCliPaths);
        return { success: true, repositories: claudeCliProjects };

      case 'claude-cloud':
        if (!configStore.hasApiKey('claude')) {
          return { success: false, error: 'Claude API key not configured', repositories: [] };
        }
        // Cloud mode doesn't need a repository - return empty array (task just needs a prompt)
        return { success: true, repositories: [] };

      default:
        return { success: false, error: `Unknown provider: ${provider}`, repositories: [] };
    }
  } catch (err) {
    console.error(`Error fetching repositories for ${provider}:`, err);
    return { success: false, error: err.message, repositories: [] };
  }
});

/**
 * Get repositories from all configured providers
 */
ipcMain.handle('repos:get-all', async () => {
  const results = {
    jules: [],
    cursor: [],
    gemini: [],
    codex: [],
    'claude-cli': [],
    'claude-cloud': [],
    errors: []
  };

  // Fetch from all providers in parallel
  const allProjectPaths = configStore.getAllProjectPaths();
  const claudeCliAvailable = claudeService.isClaudeInstalled();

  const [julesResult, cursorResult, geminiResult, codexResult, claudeCliResult] = await Promise.allSettled([
    configStore.hasApiKey('jules') ? julesService.getAllSources() : Promise.resolve([]),
    configStore.hasApiKey('cursor') ? cursorService.getAllRepositories() : Promise.resolve([]),
    geminiService.isGeminiInstalled() ? geminiService.getAvailableProjects(allProjectPaths) : Promise.resolve([]),
    configStore.hasApiKey('codex') ? codexService.getAvailableProjects() : Promise.resolve([]),
    claudeCliAvailable ? claudeService.getAvailableProjects(allProjectPaths) : Promise.resolve([])
  ]);

  if (julesResult.status === 'fulfilled') {
    results.jules = julesResult.value;
  } else if (configStore.hasApiKey('jules')) {
    results.errors.push({ provider: 'jules', error: julesResult.reason?.message || 'Unknown error' });
  }

  if (cursorResult.status === 'fulfilled') {
    results.cursor = cursorResult.value;
  } else if (configStore.hasApiKey('cursor')) {
    results.errors.push({ provider: 'cursor', error: cursorResult.reason?.message || 'Unknown error' });
  }

  if (geminiResult.status === 'fulfilled') {
    results.gemini = geminiResult.value;
  } else if (geminiService.isGeminiInstalled()) {
    results.errors.push({ provider: 'gemini', error: geminiResult.reason?.message || 'Unknown error' });
  }

  if (codexResult.status === 'fulfilled') {
    results.codex = codexResult.value;
  } else if (configStore.hasApiKey('codex')) {
    results.errors.push({ provider: 'codex', error: codexResult.reason?.message || 'Unknown error' });
  }

  if (claudeCliResult.status === 'fulfilled') {
    results['claude-cli'] = claudeCliResult.value;
  } else if (claudeCliAvailable) {
    results.errors.push({ provider: 'claude-cli', error: claudeCliResult.reason?.message || 'Unknown error' });
  }

  // Claude Cloud doesn't need repositories - it's prompt-only
  results['claude-cloud'] = [];

  return results;
});

/**
 * Create a new task/session
 */
ipcMain.handle('tasks:create', async (event, { provider, options }) => {
  try {
    switch (provider) {
      case 'jules':
        if (!configStore.hasApiKey('jules')) {
          throw new Error('Jules API key not configured');
        }
        const julesSession = await julesService.createSession(options);
        return { success: true, task: julesSession };

      case 'cursor':
        if (!configStore.hasApiKey('cursor')) {
          throw new Error('Cursor API key not configured');
        }
        const cursorAgent = await cursorService.createAgent(options);
        return { success: true, task: cursorAgent };

      case 'gemini':
        if (!geminiService.isGeminiInstalled()) {
          throw new Error('Gemini CLI not installed');
        }
        const geminiSession = await geminiService.startSession(options);
        return { success: true, task: geminiSession };

      case 'codex':
        if (!configStore.hasApiKey('codex')) {
          throw new Error('OpenAI API key not configured');
        }
        const codexTask = await codexService.createTask(options);
        // Save tracked threads to config for persistence
        configStore.setCodexThreads(codexService.getTrackedThreads());
        return { success: true, task: codexTask };

      case 'claude-cli':
        if (!claudeService.isClaudeInstalled()) {
          throw new Error('Claude CLI not installed');
        }
        // Force local mode by ensuring projectPath is set
        const claudeCliTask = await claudeService.startLocalSession(options);
        return { success: true, task: { ...claudeCliTask, provider: 'claude-cli' } };

      case 'claude-cloud':
        if (!configStore.hasApiKey('claude')) {
          throw new Error('Claude API key not configured');
        }
        // Force cloud mode by removing projectPath
        const cloudOptions = { ...options, projectPath: null };
        const claudeCloudTask = await claudeService.createTask(cloudOptions);
        // Save tracked conversations to config for persistence
        configStore.setClaudeConversations(claudeService.getTrackedConversations());
        return { success: true, task: { ...claudeCloudTask, provider: 'claude-cloud' } };

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (err) {
    console.error(`Error creating task for ${provider}:`, err);
    return { success: false, error: err.message };
  }
});

// ============================================
// IPC Handlers - CLI Terminal Management
// ============================================

/**
 * Create a new CLI session with embedded terminal
 */
ipcMain.handle('cli:create-session', async (event, { provider, projectPath, prompt }) => {
  try {
    // Generate a unique session ID
    const sessionId = `cli-${provider}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session = cliProcessManager.createSession(sessionId, provider, projectPath, prompt);
    return { success: true, session };
  } catch (err) {
    console.error(`Error creating CLI session:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * Write data to a CLI session's terminal
 */
ipcMain.handle('cli:write', async (event, { sessionId, data }) => {
  try {
    cliProcessManager.writeToSession(sessionId, data);
    return { success: true };
  } catch (err) {
    console.error(`Error writing to CLI session ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * Resize a CLI session's terminal
 */
ipcMain.handle('cli:resize', async (event, { sessionId, cols, rows }) => {
  try {
    cliProcessManager.resizeTerminal(sessionId, cols, rows);
    return { success: true };
  } catch (err) {
    console.error(`Error resizing CLI session ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * Terminate a CLI session
 */
ipcMain.handle('cli:terminate', async (event, { sessionId }) => {
  try {
    const output = cliProcessManager.terminateSession(sessionId, true);
    
    // Save output to config store for persistence
    if (output) {
      configStore.saveSessionOutput(sessionId, output);
    }
    
    return { success: true, output };
  } catch (err) {
    console.error(`Error terminating CLI session ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * Get output buffer for a CLI session
 */
ipcMain.handle('cli:get-output', async (event, { sessionId }) => {
  try {
    // First try to get from active session
    let output = cliProcessManager.getOutputBuffer(sessionId);
    
    // If not found, try to get from persisted storage
    if (output === null) {
      output = configStore.getSessionOutput(sessionId);
    }
    
    return { success: true, output: output || '' };
  } catch (err) {
    console.error(`Error getting CLI session output ${sessionId}:`, err);
    return { success: false, error: err.message, output: '' };
  }
});

/**
 * Get status of a specific CLI session
 */
ipcMain.handle('cli:get-status', async (event, { sessionId }) => {
  try {
    const status = cliProcessManager.getSessionStatus(sessionId);
    return { success: true, status };
  } catch (err) {
    console.error(`Error getting CLI session status ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
});

/**
 * Get all active CLI sessions
 */
ipcMain.handle('cli:get-all-sessions', async () => {
  try {
    const sessions = cliProcessManager.getAllSessions();
    return { success: true, sessions };
  } catch (err) {
    console.error(`Error getting all CLI sessions:`, err);
    return { success: false, error: err.message, sessions: [] };
  }
});

/**
 * Check if a session is active (has live terminal)
 */
ipcMain.handle('cli:is-active', async (event, { sessionId }) => {
  try {
    const isActive = cliProcessManager.isSessionActive(sessionId);
    return { success: true, isActive };
  } catch (err) {
    return { success: false, isActive: false };
  }
});

/**
 * Record user activity for a session (resets idle timer)
 */
ipcMain.handle('cli:record-activity', async (event, { sessionId }) => {
  try {
    cliProcessManager.recordActivity(sessionId);
    return { success: true };
  } catch (err) {
    return { success: false };
  }
});

// ============================================
// App Lifecycle
// ============================================

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPolling();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPolling();
  
  // Clean up all CLI sessions
  cliProcessManager.cleanup();
});
