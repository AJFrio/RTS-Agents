const { spawn } = require('child_process');

const configStore = require('./config-store');
const acpService = require('./acp-service');
const opencodeService = require('./opencode-service');
const antigravityService = require('./antigravity-service');
const cursorService = require('./cursor-service');
const codexService = require('./codex-service');
const claudeService = require('./claude-service');

const CLAUDE_CLI_MODELS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'opusplan'];
const CLI_LIST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MODELS = 200;
const MODEL_TOKEN_PATTERN = /^[A-Za-z0-9._/:+-]+$/;

const cache = new Map();

function parseCliModelLines(stdout) {
  const models = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const token = line.trim().split(/\s+/)[0] || '';
    if (!token || !MODEL_TOKEN_PATTERN.test(token)) continue;
    if (!models.includes(token)) models.push(token);
    if (models.length >= MAX_MODELS) break;
  }
  return models;
}

function listFromCli(command, args, timeoutMs = CLI_LIST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const spec = acpService.buildSpawnArgs(command, args);
    let child;
    try {
      child = spawn(spec.command, spec.args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env },
      });
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on?.('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on?.('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

function normalizeModelIds(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  const models = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item : item?.id || item?.name || item?.slug || '';
    if (id && !models.includes(id)) models.push(id);
    if (models.length >= MAX_MODELS) break;
  }
  return models;
}

async function listCursorModels() {
  if (configStore.hasApiKey('cursor')) {
    return { models: normalizeModelIds(await cursorService.listModels()), source: 'api' };
  }
  const adapter = acpService.resolveAdapter('cursor');
  if (adapter) {
    return { models: parseCliModelLines(await listFromCli(adapter, ['models'])), source: 'cli' };
  }
  return { models: [], source: 'none' };
}

async function getModelsForProvider(provider) {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  let result;
  try {
    switch (provider) {
      case 'opencode': {
        const stdout = await listFromCli(opencodeService.getExecutable(), ['models']);
        result = { success: true, models: parseCliModelLines(stdout), source: 'cli' };
        break;
      }
      case 'antigravity': {
        const stdout = await listFromCli(antigravityService.getExecutable(), ['models']);
        result = { success: true, models: parseCliModelLines(stdout), source: 'cli' };
        break;
      }
      case 'cursor': {
        const listed = await listCursorModels();
        result = { success: true, ...listed };
        break;
      }
      case 'codex': {
        result = configStore.hasApiKey('codex')
          ? { success: true, models: normalizeModelIds(await codexService.listModels()), source: 'api' }
          : { success: true, models: [], source: 'none' };
        break;
      }
      case 'claude-cloud': {
        result = configStore.hasApiKey('claude')
          ? { success: true, models: normalizeModelIds(await claudeService.listModels()), source: 'api' }
          : { success: true, models: [], source: 'none' };
        break;
      }
      case 'claude-cli':
        result = { success: true, models: [...CLAUDE_CLI_MODELS], source: 'static' };
        break;
      default:
        result = { success: true, models: [], source: 'none' };
        break;
    }
  } catch (err) {
    return { success: false, models: [], source: 'none', error: err?.message || String(err) };
  }

  if (result.success && result.models.length > 0) {
    cache.set(provider, { result, at: Date.now() });
  }
  return result;
}

function clearModelCache() {
  cache.clear();
}

module.exports = {
  CLAUDE_CLI_MODELS,
  clearModelCache,
  getModelsForProvider,
  parseCliModelLines,
  normalizeModelIds,
};
