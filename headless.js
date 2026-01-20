/**
 * RTS Headless Runner
 *
 * - No Electron UI
 * - Prompts for minimal setup (Cloudflare KV + paths)
 * - Pulls API keys from KV (including GitHub token)
 * - Registers device + processes remote task queue
 * - Starts a lightweight HTTP server for health/status only
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawnSync } = require('child_process');
const readline = require('readline/promises');

// Services (same ones used by Electron main)
const configStore = require('./src/main/services/config-store');
const cloudflareKvService = require('./src/main/services/cloudflare-kv-service');
const geminiService = require('./src/main/services/gemini-service');
const claudeService = require('./src/main/services/claude-service');

const CLOUDFLARE_HEARTBEAT_INTERVAL_MS = 300000; // 5 minutes
const CLOUDFLARE_QUEUE_POLL_INTERVAL_MS = 10000; // 10 seconds (faster queue consumption)
const DEVICE_STALE_OFFLINE_MS = 6 * 60 * 1000; // 6 minutes

let server = null;
let heartbeatInterval = null;
let queueInterval = null;
let isProcessingCloudflareQueue = false;
let isShuttingDown = false;

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

  fs.mkdirSync(repoPath, { recursive: false });
  await execAsync('git init', { cwd: repoPath });
  return repoPath;
}

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const res = spawnSync(String(cmd), ['--version'], {
      shell: true,
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true
    });
    if (res.error) return false;
    return res.status === 0;
  } catch {
    return false;
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

    // Process a single item per tick to avoid long blocking work.
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
        throw new Error('No GitHub repository paths configured on target device');
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

    const cliCommands = configStore.getSetting('cliCommands') || {};
    const geminiCmd = typeof cliCommands?.gemini === 'string' ? cliCommands.gemini : '';
    const claudeCmd = typeof cliCommands?.claude === 'string' ? cliCommands.claude : '';

    let started;
    if (tool === 'gemini') {
      if (!geminiService.isGeminiInstalled() && !isCommandRunnable(geminiCmd || 'gemini')) {
        throw new Error('Gemini CLI not detected on target device');
      }
      started = await geminiService.startSession({ prompt, projectPath: repoPath, command: geminiCmd || undefined });
    } else if (tool === 'claude-cli') {
      if (!claudeService.isClaudeInstalled() && !isCommandRunnable(claudeCmd || 'claude')) {
        throw new Error('Claude CLI not detected on target device');
      }
      started = await claudeService.startLocalSession({ prompt, projectPath: repoPath, command: claudeCmd || undefined });
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

async function sendCloudflareHeartbeat({ status } = {}) {
  if (!configStore.hasCloudflareConfig()) return;

  const namespaceId = await ensureCloudflareNamespaceId();
  if (!namespaceId) return;

  const identity = configStore.getOrCreateDeviceIdentity();
  const nowIso = new Date().toISOString();
  const nextStatus = status || 'on';

  // Publish local repo inventory so remote dispatch can target repos on this device.
  let repos = [];
  try {
    const githubPaths = configStore.getGithubPaths();
    if (Array.isArray(githubPaths) && githubPaths.length > 0) {
      const scanned = await geminiService.getAvailableProjects(githubPaths);
      repos = (scanned || [])
        .map(p => ({ name: p?.name || p?.id || 'unknown', path: p?.path || null }))
        .filter(r => !!r.path);
    }
  } catch (err) {
    repos = [];
  }

  const cliCommands = configStore.getSetting('cliCommands') || {};
  const geminiCmd = typeof cliCommands?.gemini === 'string' ? cliCommands.gemini : '';
  const claudeCmd = typeof cliCommands?.claude === 'string' ? cliCommands.claude : '';

  const device = {
    id: identity.id,
    name: identity.name,
    deviceType: 'headless',
    platform: process.platform,
    ...(nextStatus === 'on' ? { lastHeartbeat: nowIso } : {}),
    status: nextStatus,
    lastStatusAt: nowIso,
    tools: {
      gemini: geminiService.isGeminiInstalled() || isCommandRunnable(geminiCmd || 'gemini'),
      'claude-cli': claudeService.isClaudeInstalled() || isCommandRunnable(claudeCmd || 'claude')
    },
    repos,
    reposUpdatedAt: nowIso
  };

  await cloudflareKvService.heartbeat({ namespaceId, device, staleAfterMs: DEVICE_STALE_OFFLINE_MS });
}

async function runSetupPrompts() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Cloudflare KV config
    const currentCf = configStore.getCloudflareConfig() || {};
    const accountId = currentCf.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
    const apiToken = currentCf.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';

    let nextAccountId = accountId;
    let nextApiToken = apiToken;

    if (!nextAccountId) {
      nextAccountId = String(await rl.question('Cloudflare Account ID: ')).trim();
    }
    if (!nextApiToken) {
      nextApiToken = String(await rl.question('Cloudflare API Token: ')).trim();
    }

    if (nextAccountId && nextApiToken) {
      const next = configStore.setCloudflareConfig({ accountId: nextAccountId, apiToken: nextApiToken });
      cloudflareKvService.setConfig({ accountId: next.accountId, apiToken: next.apiToken });
    }

    const namespaceId = await ensureCloudflareNamespaceId();
    if (!namespaceId) throw new Error('Cloudflare KV is not configured');

    // Pull keys (including GitHub token)
    try {
      const keys = await cloudflareKvService.pullKeys(namespaceId);
      for (const [provider, key] of Object.entries(keys || {})) {
        configStore.setApiKey(provider, key);
      }
    } catch (_) {
      // If keys are missing, headless mode can still run remote CLI tasks.
    }

    // GitHub repo paths
    const githubPaths = configStore.getGithubPaths();
    if (!Array.isArray(githubPaths) || githubPaths.length === 0) {
      const answer = String(await rl.question('Path to your GitHub repos folder (e.g. /home/user/github): ')).trim();
      if (answer) {
        configStore.addGithubPath(answer);
      }
    }

    // CLI command overrides (optional)
    const existingCli = configStore.getSetting('cliCommands') || {};
    let geminiCmd = typeof existingCli?.gemini === 'string' ? existingCli.gemini : '';
    let claudeCmd = typeof existingCli?.claude === 'string' ? existingCli.claude : '';

    if (!geminiService.isGeminiInstalled() && !isCommandRunnable(geminiCmd || 'gemini')) {
      const answer = String(await rl.question('Gemini CLI not detected. Full path to gemini executable (or blank to skip): ')).trim();
      if (answer) geminiCmd = answer;
    }

    if (!claudeService.isClaudeInstalled() && !isCommandRunnable(claudeCmd || 'claude')) {
      const answer = String(await rl.question('Claude CLI not detected. Full path to claude executable (or blank to skip): ')).trim();
      if (answer) claudeCmd = answer;
    }

    configStore.setSetting('cliCommands', { gemini: geminiCmd, claude: claudeCmd });
  } finally {
    rl.close();
  }
}

function startHttpServer() {
  const port = Number.parseInt(process.env.RTS_HEADLESS_PORT || '3977', 10);
  const host = process.env.RTS_HEADLESS_HOST || '127.0.0.1';
  const identity = configStore.getOrCreateDeviceIdentity();

  server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (req.method === 'GET' && url.startsWith('/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deviceId: identity.id, deviceType: 'headless' }));
      return;
    }
    if (req.method === 'GET' && url.startsWith('/status')) {
      const cf = configStore.getCloudflareConfig() || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        deviceId: identity.id,
        deviceType: 'headless',
        cloudflareConfigured: !!(cf.accountId && cf.apiToken),
        namespaceId: cf.namespaceId || null,
        githubPaths: configStore.getGithubPaths()
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
}

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (queueInterval) clearInterval(queueInterval);

  try {
    await sendCloudflareHeartbeat({ status: 'off' });
  } catch (_) {
    // ignore
  }

  await new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

async function main() {
  await runSetupPrompts();
  await startHttpServer();

  const namespaceId = await ensureCloudflareNamespaceId();
  if (!namespaceId) throw new Error('Cloudflare KV is not configured');

  // Fire once immediately, then periodically.
  await sendCloudflareHeartbeat();
  heartbeatInterval = setInterval(() => {
    void sendCloudflareHeartbeat().catch(() => {});
  }, CLOUDFLARE_HEARTBEAT_INTERVAL_MS);

  // Faster queue polling loop.
  queueInterval = setInterval(() => {
    if (isShuttingDown) return;
    void processCloudflareQueue(namespaceId).catch(() => {});
  }, CLOUDFLARE_QUEUE_POLL_INTERVAL_MS);

  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });
}

main().catch(async (err) => {
  try {
    // Best effort offline + shutdown
    await shutdown();
  } finally {
    console.error(err?.message || err);
    process.exit(1);
  }
});

