/**
 * Web API adapter — browser implementation of the window.electronAPI surface.
 *
 * The desktop renderer talks to the Electron main process through
 * window.electronAPI (preload IPC). This module implements the same surface
 * for the Cloudflare Worker-served web build. It is the composition root:
 *
 *   - settings/filters/keys persist in localStorage (mobile-webapp compatible)
 *     via ./web-settings.mjs
 *   - cloud providers, GitHub, Jira and Cloudflare KV go through the
 *     same-origin worker proxy (/api/<provider>/...) via ./providers/*.mjs
 *   - agent polling, details and task dispatch live in ./web-agent-hub.mjs
 *   - Cloudflare KV sync (computers/queue/keys) lives in ./web-cloudflare-sync.mjs
 *   - local-only capabilities (filesystem, local CLIs, dialogs, app updates)
 *     degrade gracefully
 *
 * Contract tests: tests/unit/web-platform.verify.mjs
 */

import { createStorage } from './web-storage.mjs';
import { createSettingsSurface } from './web-settings.mjs';
import { createProviders } from './providers/index.mjs';
import { createAgentHub } from './web-agent-hub.mjs';
import { createCloudflareSync } from './web-cloudflare-sync.mjs';

const API_KEY_PROVIDERS = new Set(['jules', 'cursor', 'claude', 'github', 'jira', 'openrouter']);

function defaultTimers() {
  return {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
}

/**
 * Accepts either a wrapped web-storage adapter (createStorage() product) or a
 * raw localStorage-like impl and normalizes it to the adapter shape.
 */
function normalizeStorage(input) {
  if (!input) return createStorage();
  return typeof input.getSettings === 'function' ? input : createStorage(input);
}

export function createWebApi(options = {}) {
  const storage = normalizeStorage(options.storage);
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  // Polling timers only auto-schedule in a browser runtime; Node tests inject
  // timers explicitly (options.timers) to drive the polling lifecycle.
  const timers = options.timers || (typeof window !== 'undefined' ? defaultTimers() : null);
  // Raw key-value store for codex/claude tracked entities ('codex_tracked_threads',
  // 'claude_tracked_conversations') — browser localStorage unless injected.
  const kv = options.kv || (typeof localStorage !== 'undefined' ? localStorage : null);

  const providers = createProviders({ storage, fetchImpl, kv });
  const settingsSurface = createSettingsSurface(storage);
  const hub = createAgentHub({
    storage,
    providers,
    timers,
    onTick: () => emitRefreshTick(),
  });
  const sync = createCloudflareSync({ storage, kv: providers.cloudflareKv });

  const tickSubscribers = new Set();

  function emitRefreshTick() {
    for (const cb of tickSubscribers) {
      try {
        cb();
      } catch (err) {
        console.error('refresh tick subscriber failed:', err);
      }
    }
  }

  async function testApiKey(provider) {
    switch (provider) {
      case 'jules':
        return providers.jules.testConnection();
      case 'cursor':
        return providers.cursor.testConnection();
      case 'claude':
        return providers.claude.testConnection();
      case 'github':
        return providers.github.testConnection();
      case 'jira':
        return providers.jira.testConnection();
      case 'openrouter':
        return providers.openrouter.testConnection();
      default:
        return { success: false, error: `Unknown provider: ${provider}` };
    }
  }

  async function setPolling(enabled, interval) {
    const next = { autoPolling: enabled !== false };
    if (interval !== undefined) next.pollingInterval = interval;
    storage.setSettings(next);
    if (next.autoPolling) {
      hub.startPolling(storage.getSettings().pollingInterval);
    } else {
      hub.stopPolling();
    }
    return { success: true };
  }

  async function getRepositories(provider) {
    try {
      switch (provider) {
        case 'jules': {
          if (!storage.hasApiKey('jules')) {
            return { success: false, error: 'Jules API key not configured', repositories: [] };
          }
          return { success: true, repositories: await providers.jules.getAllSources() };
        }
        case 'cursor': {
          if (!storage.hasApiKey('cursor')) {
            return { success: false, error: 'Cursor API key not configured', repositories: [] };
          }
          return { success: true, repositories: await providers.cursor.getAllRepositories() };
        }
        // Cloud/local providers have no remote repository catalog on web.
        default:
          return { success: true, repositories: [] };
      }
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error', repositories: [] };
    }
  }

  async function getAllRepositories() {
    const results = {
      errors: [],
      jules: [],
      cursor: [],
      antigravity: [],
      codex: [],
      'claude-cli': [],
      'claude-cloud': [],
      opencode: [],
    };

    const settled = await Promise.allSettled([
      storage.hasApiKey('jules') ? providers.jules.getAllSources() : Promise.resolve([]),
      storage.hasApiKey('cursor') ? providers.cursor.getAllRepositories() : Promise.resolve([]),
    ]);

    const keys = ['jules', 'cursor'];
    const reportFlags = [storage.hasApiKey('jules'), storage.hasApiKey('cursor')];

    settled.forEach((entry, index) => {
      const key = keys[index];
      if (entry.status === 'fulfilled') {
        results[key] = entry.value;
      } else if (reportFlags[index]) {
        results.errors.push({ provider: key, error: entry.reason?.message || 'Unknown error' });
      }
    });

    return results;
  }

  return {
    // ------------------------------------------------------------------
    // Settings / config (web-settings surface)
    // ------------------------------------------------------------------
    ...settingsSurface,

    async setApiKey(provider, key) {
      if (!API_KEY_PROVIDERS.has(provider)) {
        return { success: false, error: 'Unknown provider' };
      }
      storage.setApiKey(provider, key);
      return { success: true };
    },

    testApiKey,
    setPolling,

    // Cloudflare KV sync (computers / queue / keys / test)
    testCloudflare: sync.testCloudflare,
    listComputers: sync.listComputers,
    getQueueActivity: sync.getQueueActivity,
    pushKeysToCloudflare: sync.pushKeysToCloudflare,
    pullKeysFromCloudflare: sync.pullKeysFromCloudflare,

    // ------------------------------------------------------------------
    // Agents (web-agent-hub)
    // ------------------------------------------------------------------
    getAgents: hub.getAgents,
    getAgentDetails: hub.getAgentDetails,

    async getJulesAgentDetailsText(sessionId) {
      return providers.jules.getAgentDetailsText(sessionId);
    },

    async getJulesActivityMedia(sessionId, activityId) {
      return providers.jules.getActivityMedia(sessionId, activityId);
    },

    onRefreshTick(callback) {
      tickSubscribers.add(callback);
      return () => {
        tickSubscribers.delete(callback);
      };
    },

    onSessionUpdated() {
      return () => {};
    },

    _emitRefreshTick: emitRefreshTick,

    // ------------------------------------------------------------------
    // Tasks (web-agent-hub)
    // ------------------------------------------------------------------
    createTask: hub.createTask,
    sendMessage: hub.sendMessage,
    getProviderModels: hub.getProviderModels,

    async orchestratorGetModels() {
      return providers.orchestrator.getAvailableModels();
    },

    async orchestratorChat(messages, selectedModel) {
      return providers.orchestrator.chat(messages, selectedModel);
    },

    getRepositories,
    getAllRepositories,

    // ------------------------------------------------------------------
    // GitHub / Jira (worker proxy via provider services)
    // ------------------------------------------------------------------
    github: providers.github,
    jira: providers.jira,

    platform: 'web',
    versions: {},
  };
}

export default createWebApi;
