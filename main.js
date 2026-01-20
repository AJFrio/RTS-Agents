const { app, BrowserWindow, ipcMain, shell, Menu, MenuItem, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');

// Services
const configStore = require('./src/main/services/config-store');
const geminiService = require('./src/main/services/gemini-service');
const julesService = require('./src/main/services/jules-service');
const cursorService = require('./src/main/services/cursor-service');
const codexService = require('./src/main/services/codex-service');
const claudeService = require('./src/main/services/claude-service');
const githubService = require('./src/main/services/github-service');
const cloudflareKvService = require('./src/main/services/cloudflare-kv-service');

let mainWindow;
let pollingInterval = null;
let cloudflareHeartbeatInterval = null;
let updateInterval = null;
let isQuitting = false;
let isProcessingCloudflareQueue = false;

const CLOUDFLARE_HEARTBEAT_INTERVAL_MS = 300000; // 5 minutes
const UPDATE_INTERVAL_MS = 21600000; // 6 hours
const DEVICE_STALE_OFFLINE_MS = 6 * 60 * 1000; // 6 minutes

function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function createLocalGitRepo({ directory, name }) {
  if (!name || typeof name !== 'string') throw new Error('Missing repository name');
  if (!directory || typeof directory !== 'string') throw new Error('Missing base directory');

  const baseDir = directory.trim();
  const repoName = name.trim();
  if (!baseDir) throw new Error('Missing base directory');
  if (!repoName) throw new Error('Missing repository name');

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Base directory does not exist: ${baseDir}`);
  }

  const repoPath = path.join(baseDir, repoName);
  if (fs.existsSync(repoPath)) {
    throw new Error(`Target path already exists: ${repoPath}`);
  }

  await fsp.mkdir(repoPath, { recursive: false });
  await execAsync('git init', { cwd: repoPath });

  return repoPath;
}

function createWindow() {
  const displayMode = configStore.getDisplayMode();
  const isFullscreen = displayMode === 'fullscreen';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    fullscreen: isFullscreen,
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
    startCloudflareHeartbeatIfEnabled();
  });

  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Add spellcheck suggestions
    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Basic actions
    menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut }));
    menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }));
    menu.append(new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste }));

    // Only show if we have items
    if (menu.items.length > 0) {
      menu.popup({ window: mainWindow, x: params.x, y: params.y });
    }
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

  const githubKey = configStore.getApiKey('github');
  if (githubKey) {
    githubService.setApiKey(githubKey);
  }

  // Cloudflare KV (for computers/heartbeats)
  const cf = configStore.getCloudflareConfig();
  if (cf?.accountId && cf?.apiToken) {
    cloudflareKvService.setConfig({ accountId: cf.accountId, apiToken: cf.apiToken });
  }
}

async function ensureCloudflareNamespaceId() {
  if (!configStore.hasCloudflareConfig()) return null;
  const cfg = configStore.getCloudflareConfig();
  cloudflareKvService.setConfig({ accountId: cfg.accountId, apiToken: cfg.apiToken });

  if (cfg?.namespaceId) return cfg.namespaceId;
  const namespaceTitle = cfg?.namespaceTitle || 'rtsa';
  const namespaceId = await cloudflareKvService.ensureNamespace(namespaceTitle);
  configStore.setCloudflareConfig({ namespaceId, namespaceTitle });
  return namespaceId;
}

async function sendCloudflareHeartbeat({ status } = {}) {
  if (!configStore.hasCloudflareConfig()) return;

  const namespaceId = await ensureCloudflareNamespaceId();
  if (!namespaceId) return;

  const identity = configStore.getOrCreateDeviceIdentity();
  const nowIso = new Date().toISOString();
  const nextStatus = status || 'on';

  // If GitHub paths are configured, publish local repo inventory so other machines
  // can target a repo that exists on this device.
  let repos = [];
  try {
    const githubPaths = configStore.getGithubPaths();
    if (Array.isArray(githubPaths) && githubPaths.length > 0) {
      const scanned = await geminiService.getAvailableProjects(githubPaths);
      repos = (scanned || [])
        .map(p => ({
          name: p?.name || p?.id || 'unknown',
          path: p?.path || null
        }))
        .filter(r => !!r.path);
    }
  } catch (err) {
    console.warn('Failed to scan local repos for heartbeat:', err?.message || err);
    repos = [];
  }

  const device = {
    id: identity.id,
    name: identity.name,
    deviceType: 'desktop',
    platform: process.platform,
    ...(nextStatus === 'on' ? { lastHeartbeat: nowIso } : {}),
    status: nextStatus,
    lastStatusAt: nowIso,
    tools: {
      gemini: geminiService.isGeminiInstalled(),
      'claude-cli': claudeService.isClaudeInstalled()
    },
    repos,
    reposUpdatedAt: nowIso
  };

  await cloudflareKvService.heartbeat({ namespaceId, device, staleAfterMs: DEVICE_STALE_OFFLINE_MS });

  // On each heartbeat, opportunistically pull and execute queued remote tasks for this device.
  // Intentionally skipped while shutting down or when marking the device offline.
  if (!isQuitting && nextStatus === 'on') {
    void processCloudflareQueue(namespaceId).catch(err => {
      console.warn('Cloudflare queue processing failed:', err?.message || err);
    });
  }
}

async function processCloudflareQueue(namespaceId) {
  if (!namespaceId) return;
  if (!configStore.hasCloudflareConfig()) return;
  if (isProcessingCloudflareQueue) return;

  isProcessingCloudflareQueue = true;
  const identity = configStore.getOrCreateDeviceIdentity();
  const nowIso = new Date().toISOString();

  try {
    const queue = await cloudflareKvService.getDeviceQueue(namespaceId, identity.id);
    if (!Array.isArray(queue) || queue.length === 0) return;

    // Process a single item per heartbeat to avoid long blocking work.
    const item = queue[0];
    const rest = queue.slice(1);

    // Remove from queue first to avoid re-processing on crashes/retries.
    await cloudflareKvService.putDeviceQueue(namespaceId, identity.id, rest);

    const baseStatus = {
      status: 'starting',
      tool: item?.tool || null,
      repo: item?.repo || null,
      prompt: item?.prompt || null,
      requestedBy: item?.requestedBy || null,
      taskRequestId: item?.id || null,
      device: { id: identity.id, name: identity.name },
      updatedAt: nowIso
    };

    await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, baseStatus);

    const tool = item?.tool;
    if (!tool) throw new Error('Queued task missing tool');

    // Project/repo creation tasks (no prompt/repo.path required)
    if (tool === 'project:create') {
      const repoName = item?.repo?.name || item?.repoName || item?.name;
      if (!repoName) throw new Error('Queued task missing repo.name');

      const githubPaths = configStore.getGithubPaths();
      const baseDir = Array.isArray(githubPaths) && githubPaths.length > 0 ? githubPaths[0] : null;
      if (!baseDir) {
        throw new Error('No GitHub repository paths configured on target device (Settings → GitHub Repository Paths)');
      }

      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        ...baseStatus,
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const createdPath = await createLocalGitRepo({ directory: baseDir, name: String(repoName) });

      await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
        ...baseStatus,
        status: 'completed',
        result: { path: createdPath, directory: baseDir, name: String(repoName) },
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return;
    }

    const repoPath = item?.repo?.path;
    const prompt = item?.prompt;
    if (!prompt) throw new Error('Queued task missing prompt');
    if (!repoPath) throw new Error('Queued task missing repo.path');

    let started;
    if (tool === 'gemini') {
      if (!geminiService.isGeminiInstalled()) throw new Error('Gemini CLI not installed on target device');
      started = await geminiService.startSession({ prompt, projectPath: repoPath });
    } else if (tool === 'claude-cli') {
      if (!claudeService.isClaudeInstalled()) throw new Error('Claude CLI not installed on target device');
      started = await claudeService.startLocalSession({ prompt, projectPath: repoPath });
    } else {
      throw new Error(`Unsupported queued tool: ${tool}`);
    }

    await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
      ...baseStatus,
      status: 'running',
      startedAt: new Date().toISOString(),
      startedTask: started || null,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    await cloudflareKvService.setDeviceTaskStatus(namespaceId, identity.id, {
      status: 'error',
      error: err?.message || String(err),
      device: { id: identity.id, name: identity.name },
      updatedAt: new Date().toISOString()
    });
  } finally {
    isProcessingCloudflareQueue = false;
  }
}

function startCloudflareHeartbeatIfEnabled() {
  stopCloudflareHeartbeat();
  if (!configStore.hasCloudflareConfig()) return;

  // Fire once immediately, then periodically.
  void sendCloudflareHeartbeat().catch(err => {
    console.warn('Cloudflare heartbeat failed:', err?.message || err);
  });

  cloudflareHeartbeatInterval = setInterval(() => {
    void sendCloudflareHeartbeat().catch(err => {
      console.warn('Cloudflare heartbeat failed:', err?.message || err);
    });
  }, CLOUDFLARE_HEARTBEAT_INTERVAL_MS);
}

function stopCloudflareHeartbeat() {
  if (cloudflareHeartbeatInterval) {
    clearInterval(cloudflareHeartbeatInterval);
    cloudflareHeartbeatInterval = null;
  }
}

async function sendCloudflareOffline() {
  try {
    await sendCloudflareHeartbeat({ status: 'off' });
  } catch (err) {
    console.warn('Cloudflare offline update failed:', err?.message || err);
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

function startAutoUpdateTimer() {
  stopAutoUpdateTimer();
  console.log(`Starting auto-update timer (interval: ${UPDATE_INTERVAL_MS}ms)`);
  updateInterval = setInterval(() => {
    performUpdate();
  }, UPDATE_INTERVAL_MS);
}

function stopAutoUpdateTimer() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
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

ipcMain.handle('github:mark-pr-ready-for-review', async (event, { nodeId }) => {
  try {
    const result = await githubService.markPullRequestReadyForReview(nodeId);
    if (result.errors) {
       return { success: false, error: result.errors[0].message };
    }
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
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
      claude: configStore.hasApiKey('claude'),
      github: configStore.hasApiKey('github'),
      cloudflare: configStore.hasCloudflareConfig()
    },
    cloudflare: (() => {
      const cfg = configStore.getCloudflareConfig();
      return {
        configured: configStore.hasCloudflareConfig(),
        accountId: cfg?.accountId || '',
        namespaceTitle: cfg?.namespaceTitle || 'rtsa'
      };
    })(),
    geminiInstalled: geminiService.isGeminiInstalled(),
    geminiDefaultPath: geminiService.getDefaultPath(),
    claudeCliInstalled: claudeService.isClaudeInstalled(),
    claudeCloudConfigured: configStore.hasApiKey('claude'),
    claudeDefaultPath: claudeService.getDefaultPath(),
    githubPaths: configStore.getGithubPaths(),
    filters: configStore.getFilters(),
    localDeviceId: configStore.getOrCreateDeviceIdentity().id
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
  } else if (provider === 'github') {
    githubService.setApiKey(key);
  }
  
  return { success: true };
});

// ============================================
// IPC Handlers - Cloudflare KV (Computers)
// ============================================

ipcMain.handle('cloudflare:set-config', async (event, { accountId, apiToken, namespaceTitle } = {}) => {
  const next = configStore.setCloudflareConfig({ accountId, apiToken, namespaceTitle });
  if (next?.accountId && next?.apiToken) {
    cloudflareKvService.setConfig({ accountId: next.accountId, apiToken: next.apiToken });
    startCloudflareHeartbeatIfEnabled();
  }
  return { success: true };
});

ipcMain.handle('cloudflare:clear-config', async () => {
  configStore.clearCloudflareConfig();
  stopCloudflareHeartbeat();
  return { success: true };
});

ipcMain.handle('cloudflare:test', async () => {
  try {
    if (!configStore.hasCloudflareConfig()) {
      return { success: false, error: 'Cloudflare not configured' };
    }
    const namespaceId = await ensureCloudflareNamespaceId();
    return { success: true, namespaceId };
  } catch (err) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
});

ipcMain.handle('computers:list', async () => {
  try {
    if (!configStore.hasCloudflareConfig()) {
      return { success: true, configured: false, computers: [] };
    }

    const cfg = configStore.getCloudflareConfig();
    cloudflareKvService.setConfig({ accountId: cfg.accountId, apiToken: cfg.apiToken });
    const namespaceId = await ensureCloudflareNamespaceId();
    const computers = await cloudflareKvService.getValueJson(namespaceId, 'devices', []);

    return {
      success: true,
      configured: true,
      computers: Array.isArray(computers) ? computers : []
    };
  } catch (err) {
    return {
      success: false,
      configured: configStore.hasCloudflareConfig(),
      error: err?.message || 'Unknown error',
      computers: []
    };
  }
});

ipcMain.handle('cloudflare:push-keys', async () => {
  try {
    if (!configStore.hasCloudflareConfig()) {
      return { success: false, error: 'Cloudflare not configured' };
    }
    const namespaceId = await ensureCloudflareNamespaceId();
    const keys = configStore.getAllApiKeys();
    await cloudflareKvService.pushKeys(namespaceId, keys);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
});

ipcMain.handle('cloudflare:pull-keys', async () => {
  try {
    if (!configStore.hasCloudflareConfig()) {
      return { success: false, error: 'Cloudflare not configured' };
    }
    const namespaceId = await ensureCloudflareNamespaceId();
    const keys = await cloudflareKvService.pullKeys(namespaceId);

    // Update local configStore with pulled keys
    for (const [provider, key] of Object.entries(keys)) {
      configStore.setApiKey(provider, key);
    }

    // Re-initialize services to use new keys
    initializeServices();

    return { success: true, keys };
  } catch (err) {
    return { success: false, error: err?.message || 'Unknown error' };
  }
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
    } else if (provider === 'github') {
      return await githubService.testConnection();
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
  } else if (provider === 'github') {
    githubService.setApiKey(null);
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(mode === 'fullscreen');
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
 * Update the application (git pull + dependencies + build + restart)
 */
ipcMain.handle('app:update', async () => {
  return performUpdate();
});

function performUpdate() {
  console.log('Update requested. Executing git stash, git pull, npm install, and build...');

  return new Promise((resolve) => {
    // Execute git stash (to save local changes), git pull, npm install, and build css
    // Using stash --include-untracked ensures we stash user changes but NOT ignored files (like node_modules)
    // Using cwd: __dirname to ensure we run in the project root
    const command = 'git stash --include-untracked && git pull && npm install && npm run build:css:prod';

    exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Update failed: ${error.message}`);
        resolve({ success: false, error: error.message });
        return;
      }

      console.log(`Update stdout: ${stdout}`);
      if (stderr) console.error(`Update stderr: ${stderr}`);

      resolve({ success: true });

      // If successful, restart the app
      console.log('Update successful. Restarting application...');
      app.relaunch();
      app.quit();
    });
  });
}

/**
 * Open external URL in browser
 */
ipcMain.handle('utils:open-external', async (event, { url }) => {
  await shell.openExternal(url);
  return { success: true };
});

/**
 * Open directory selection dialog
 */
ipcMain.handle('dialog:open-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

/**
 * Get provider connection status
 */
ipcMain.handle('utils:get-status', async () => {
  const [julesStatus, cursorStatus, codexStatus, claudeCloudStatus, githubStatus] = await Promise.allSettled([
    configStore.hasApiKey('jules') ? julesService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('cursor') ? cursorService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('codex') ? codexService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('claude') ? claudeService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' }),
    configStore.hasApiKey('github') ? githubService.testConnection() : Promise.resolve({ success: false, error: 'Not configured' })
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
    },
    github: githubStatus.status === 'fulfilled' ? githubStatus.value : { success: false, error: githubStatus.reason?.message }
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
    // Handle remote task execution
    if (options && options.targetDeviceId) {
      const namespaceId = await ensureCloudflareNamespaceId();
      if (!namespaceId) throw new Error('Cloudflare KV not configured');

      // Validate supported remote tools
      if (provider !== 'gemini' && provider !== 'claude-cli') {
        throw new Error(`Remote execution is not supported for ${provider}. Only local CLI tools (Gemini, Claude CLI) can be run remotely.`);
      }

      const identity = configStore.getOrCreateDeviceIdentity();
      const nowIso = new Date().toISOString();
      const repoPath = options.projectPath || options.repository; // Remotes expect path

      if (!repoPath) throw new Error('Repository path is required for remote tasks');

      const task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: provider,
        repo: { path: repoPath },
        prompt: options.prompt,
        requestedBy: identity.name,
        createdAt: nowIso
      };

      await cloudflareKvService.enqueueDeviceTask(namespaceId, options.targetDeviceId, task);

      return {
        success: true,
        task: {
          ...task,
          status: 'queued',
          provider,
          name: `Remote ${provider} task`,
          summary: `Queued on remote device`
        }
      };
    }

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

/**
 * Send a follow-up message to a task/session
 */
ipcMain.handle('tasks:send-message', async (event, { provider, rawId, message }) => {
  try {
    switch (provider) {
      case 'jules':
        if (!configStore.hasApiKey('jules')) {
          throw new Error('Jules API key not configured');
        }
        await julesService.sendMessage(rawId, message);
        return { success: true };

      case 'cursor':
        if (!configStore.hasApiKey('cursor')) {
          throw new Error('Cursor API key not configured');
        }
        await cursorService.addFollowUp(rawId, message);
        return { success: true };

      default:
        throw new Error(`Provider ${provider} does not support follow-up messages`);
    }
  } catch (err) {
    console.error(`Error sending message for ${provider}:`, err);
    return { success: false, error: err.message };
  }
});

// ============================================
// IPC Handlers - GitHub
// ============================================

ipcMain.handle('github:get-repos', async () => {
  try {
    const repos = await githubService.getUserRepos();
    return { success: true, repos };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github:get-owners', async () => {
  try {
    const user = await githubService.getCurrentUser();
    const orgs = await githubService.getUserOrgs();
    return { success: true, user, orgs };
  } catch (err) {
    return { success: false, error: err.message, user: null, orgs: [] };
  }
});

ipcMain.handle('github:create-repo', async (event, { ownerType, owner, name, private: isPrivate } = {}) => {
  try {
    const repo = await githubService.createRepository({
      ownerType,
      owner,
      name,
      private: !!isPrivate
    });
    return { success: true, repo };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github:get-prs', async (event, { owner, repo, state }) => {
  try {
    const prs = await githubService.getPullRequests(owner, repo, state);
    return { success: true, prs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github:get-branches', async (event, { owner, repo }) => {
  try {
    const branches = await githubService.getBranches(owner, repo);
    return { success: true, branches };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github:get-pr-details', async (event, { owner, repo, prNumber }) => {
  try {
    const pr = await githubService.getPullRequestDetails(owner, repo, prNumber);
    return { success: true, pr };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('github:merge-pr', async (event, { owner, repo, prNumber, method }) => {
  try {
    const result = await githubService.mergePullRequest(owner, repo, prNumber, method);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================
// IPC Handlers - Project/Repo Creation
// ============================================

ipcMain.handle('projects:create-local-repo', async (event, { name, directory } = {}) => {
  try {
    const repoPath = await createLocalGitRepo({ directory, name });
    return { success: true, path: repoPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('projects:enqueue-create-repo', async (event, { deviceId, name } = {}) => {
  try {
    if (!deviceId) throw new Error('Missing deviceId');
    if (!name) throw new Error('Missing repository name');
    const namespaceId = await ensureCloudflareNamespaceId();
    if (!namespaceId) throw new Error('Cloudflare KV not configured');

    const identity = configStore.getOrCreateDeviceIdentity();
    const nowIso = new Date().toISOString();

    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: 'project:create',
      repo: { name: String(name) },
      requestedBy: identity.name,
      createdAt: nowIso
    };

    await cloudflareKvService.enqueueDeviceTask(namespaceId, deviceId, task);
    return { success: true, task };
  } catch (err) {
    return { success: false, error: err.message };
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

  startAutoUpdateTimer();
});

app.on('window-all-closed', () => {
  stopPolling();
  stopCloudflareHeartbeat();
  stopAutoUpdateTimer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  stopPolling();
  stopCloudflareHeartbeat();
  stopAutoUpdateTimer();

  if (isQuitting) return;
  isQuitting = true;

  // Give Cloudflare KV a brief chance to record OFF status before exit.
  event.preventDefault();
  void Promise.race([
    sendCloudflareOffline(),
    new Promise(resolve => setTimeout(resolve, 2000))
  ]).finally(() => {
    app.quit();
  });
});
