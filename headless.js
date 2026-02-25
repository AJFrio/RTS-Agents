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
const readline = require('readline/promises');

// Services (same ones used by Electron main)
const configStore = require('./src/main/services/config-store');
const cloudflareKvService = require('./src/main/services/cloudflare-kv-service');
const geminiService = require('./src/main/services/gemini-service');
const claudeService = require('./src/main/services/claude-service');
const queueProcessorService = require('./src/main/services/queue-processor-service');

const CLOUDFLARE_HEARTBEAT_INTERVAL_MS = 300000; // 5 minutes
const CLOUDFLARE_QUEUE_POLL_INTERVAL_MS = 10000; // 10 seconds (faster queue consumption)
const DEVICE_STALE_OFFLINE_MS = 6 * 60 * 1000; // 6 minutes

let server = null;
let heartbeatInterval = null;
let queueInterval = null;
let isShuttingDown = false;

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
      gemini: geminiService.isGeminiInstalled() || queueProcessorService.isCommandRunnable(geminiCmd || 'gemini'),
      'claude-cli': claudeService.isClaudeInstalled() || queueProcessorService.isCommandRunnable(claudeCmd || 'claude')
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

    if (!geminiService.isGeminiInstalled() && !queueProcessorService.isCommandRunnable(geminiCmd || 'gemini')) {
      const answer = String(await rl.question('Gemini CLI not detected. Full path to gemini executable (or blank to skip): ')).trim();
      if (answer) geminiCmd = answer;
    }

    if (!claudeService.isClaudeInstalled() && !queueProcessorService.isCommandRunnable(claudeCmd || 'claude')) {
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
    void queueProcessorService.processQueue(namespaceId).catch(() => {});
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

