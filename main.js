const { app, BrowserWindow, shell, Menu, MenuItem, dialog } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');

// Services
const configStore = require('./src/main/services/config-store');
const geminiService = require('./src/main/services/gemini-service');
const julesService = require('./src/main/services/jules-service');
const cursorService = require('./src/main/services/cursor-service');
const codexService = require('./src/main/services/codex-service');
const claudeService = require('./src/main/services/claude-service');
const openRouterService = require('./src/main/services/openrouter-service');
const agentOrchestrator = require('./src/main/services/agent-orchestrator');
const githubService = require('./src/main/services/github-service');
const cloudflareKvService = require('./src/main/services/cloudflare-kv-service');
const jiraService = require('./src/main/services/jira-service');
const projectService = require('./src/main/services/project-service');
const queueProcessorService = require('./src/main/services/queue-processor-service');
const opencodeService = require('./src/main/services/opencode-service');
const antigravityService = require('./src/main/services/antigravity-service');
const agentDiscoveryCache = require('./src/main/services/agent-discovery-cache');
const { clearInstallStatusCache } = require('./src/main/utils/install-status');

const { registerAllIpcHandlers } = require('./src/main/ipc');

let mainWindow;
let pollingInterval = null;
let cloudflareHeartbeatInterval = null;
let updateInterval = null;
let isQuitting = false;

const CLOUDFLARE_HEARTBEAT_INTERVAL_MS = 300000; // 5 minutes
const UPDATE_INTERVAL_MS = 21600000; // 6 hours
const DEVICE_STALE_OFFLINE_MS = 6 * 60 * 1000; // 6 minutes

function getMainWindow() {
  return mainWindow;
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

  const rendererUrl = process.env.VITE_DEV_SERVER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/renderer/index.html'));
  }

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    initializeServices();
    startDiscoveryWatchers();
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
  const openRouterKey = configStore.getApiKey('openrouter');
  const geminiKey = configStore.getApiKey('gemini');

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
  if (openRouterKey) {
    openRouterService.setApiKey(openRouterKey);
  }
  if (geminiKey) {
    geminiService.setApiKey(geminiKey);
  }

  const opencodeSessions = configStore.getOpenCodeSessions();
  opencodeService.setTrackedSessions(opencodeSessions);
  const antigravitySessions = configStore.getAntigravitySessions();
  antigravityService.setTrackedSessions(antigravitySessions);

  const githubKey = configStore.getApiKey('github');
  if (githubKey) {
    githubService.setApiKey(githubKey);
  }

  // Cloudflare KV (for computers/heartbeats)
  const cf = configStore.getCloudflareConfig();
  if (cf?.accountId && cf?.apiToken) {
    cloudflareKvService.setConfig({ accountId: cf.accountId, apiToken: cf.apiToken });
  }

  void Promise.all([
    antigravityService.refreshInstallStatus(),
    geminiService.refreshInstallStatus(),
    claudeService.refreshInstallStatus(),
    opencodeService.refreshInstallStatus()
  ]).catch((err) => {
    console.warn('Install status warm-up failed:', err?.message || err);
  });
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

  const [antigravityInstalled, claudeInstalled, opencodeInstalled] = await Promise.all([
    antigravityService.isAntigravityInstalled(),
    claudeService.isClaudeInstalled(),
    opencodeService.isOpenCodeInstalled()
  ]);

  const availableCliTools = [];
  if (configStore.getCodexPaths().length > 0) availableCliTools.push('Codex CLI');
  if (antigravityInstalled) availableCliTools.push('Antigravity CLI');
  if (claudeInstalled) availableCliTools.push('claude CLI');
  if (opencodeInstalled) availableCliTools.push('OpenCode CLI');
  if (configStore.getCursorPaths().length > 0) availableCliTools.push('cursor CLI');

  const device = {
    id: identity.id,
    name: identity.name,
    deviceType: 'desktop',
    platform: process.platform,
    ...(nextStatus === 'on' ? { lastHeartbeat: nowIso } : {}),
    status: nextStatus,
    lastStatusAt: nowIso,
    tools: [{ 'CLI tools': availableCliTools }],
    repos,
    reposUpdatedAt: nowIso
  };

  await cloudflareKvService.heartbeat({ namespaceId, device, staleAfterMs: DEVICE_STALE_OFFLINE_MS });

  // On each heartbeat, opportunistically pull and execute queued remote tasks for this device.
  // Intentionally skipped while shutting down or when marking the device offline.
  if (!isQuitting && nextStatus === 'on') {
    void queueProcessorService.processQueue(namespaceId).catch(err => {
      console.warn('Cloudflare queue processing failed:', err?.message || err);
    });
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

let performUpdate = () => Promise.resolve({ success: false, error: 'Not initialized' });

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

function startDiscoveryWatchers() {
  const deps = {
    configStore,
    antigravityService,
    geminiService,
    claudeService,
    opencodeService
  };
  agentDiscoveryCache.startWatchers(deps, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agents:refresh-tick');
    }
  });
}

function stopDiscoveryWatchers() {
  agentDiscoveryCache.stopWatchers();
}

function invalidateAgentDiscovery() {
  clearInstallStatusCache();
  agentDiscoveryCache.invalidate();
  void Promise.all([
    antigravityService.refreshInstallStatus(),
    geminiService.refreshInstallStatus(),
    claudeService.refreshInstallStatus(),
    opencodeService.refreshInstallStatus()
  ]).catch(() => {});
}

const lifecycle = {
  ensureCloudflareNamespaceId,
  sendCloudflareHeartbeat,
  startCloudflareHeartbeatIfEnabled,
  stopCloudflareHeartbeat,
  sendCloudflareOffline,
  startPolling,
  stopPolling,
  startPollingIfEnabled,
  initializeServices,
  startDiscoveryWatchers,
  stopDiscoveryWatchers,
  invalidateAgentDiscovery
};

const ipcExports = registerAllIpcHandlers({
  configStore,
  antigravityService,
  geminiService,
  julesService,
  cursorService,
  codexService,
  claudeService,
  openRouterService,
  agentOrchestrator,
  githubService,
  cloudflareKvService,
  jiraService,
  projectService,
  opencodeService,
  lifecycle,
  getMainWindow,
  app,
  shell,
  dialog,
  exec,
  spawn,
  appRoot: __dirname
});
performUpdate = ipcExports.performUpdate;

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
  stopDiscoveryWatchers();
  stopCloudflareHeartbeat();
  stopAutoUpdateTimer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  stopPolling();
  stopDiscoveryWatchers();
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
