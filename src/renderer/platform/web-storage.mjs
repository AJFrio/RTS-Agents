/**
 * Web storage adapter (browser runtime).
 *
 * Ported from mobile-webapp/src/services/storage-service.ts so existing PWA
 * users keep their stored keys. Uses simple base64 obfuscation — NOT encryption.
 *
 * The underlying storage implementation is injectable so the contract tests in
 * tests/unit/web-platform.verify.mjs can run outside a browser.
 */

export const STORAGE_PREFIX = 'rts_agents_';

const LEGACY_KEY_ALIASES = {
  jules: ['julesApiKey'],
  cursor: ['cursorApiKey'],
  codex: ['codexApiKey', 'openai', 'openaiApiKey'],
  claude: ['claudeApiKey', 'anthropic', 'anthropicApiKey'],
  jira: ['jiraApiKey', 'jiraToken'],
  github: ['githubApiKey', 'githubToken'],
};

const SETTINGS_DEFAULTS = {
  pollingInterval: 30000,
  autoPolling: true,
  theme: 'system',
  displayMode: 'fullscreen',
  jiraBaseUrl: '',
  selectedModel: 'openrouter/openai/gpt-4o',
};

const FILTERS_DEFAULTS = {
  providers: {
    antigravity: true,
    jules: true,
    cursor: true,
    codex: true,
    'claude-cloud': true,
    'claude-cli': true,
    opencode: true,
  },
  statuses: {
    running: true,
    completed: true,
    pending: true,
    failed: true,
    stopped: true,
  },
  search: '',
};

function encode(value) {
  try {
    return btoa(value);
  } catch {
    return value;
  }
}

function decode(value) {
  try {
    return atob(value);
  } catch {
    return value;
  }
}

function readJson(impl, key) {
  const raw = impl.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createStorage(impl = globalThis.localStorage) {
  function hasBackend() {
    return !!impl;
  }

  return {
    setApiKey(provider, key) {
      if (!hasBackend()) return;
      if (key) {
        impl.setItem(`${STORAGE_PREFIX}key_${provider}`, encode(key));
        for (const alias of LEGACY_KEY_ALIASES[provider] || []) {
          impl.removeItem(`${STORAGE_PREFIX}key_${alias}`);
        }
      } else {
        impl.removeItem(`${STORAGE_PREFIX}key_${provider}`);
      }
    },

    getApiKey(provider) {
      if (!hasBackend()) return null;
      const stored = impl.getItem(`${STORAGE_PREFIX}key_${provider}`);
      if (stored) return decode(stored);
      for (const alias of LEGACY_KEY_ALIASES[provider] || []) {
        const legacyValue = impl.getItem(`${STORAGE_PREFIX}key_${alias}`);
        if (legacyValue) return decode(legacyValue);
      }
      return null;
    },

    removeApiKey(provider) {
      if (!hasBackend()) return;
      impl.removeItem(`${STORAGE_PREFIX}key_${provider}`);
      for (const alias of LEGACY_KEY_ALIASES[provider] || []) {
        impl.removeItem(`${STORAGE_PREFIX}key_${alias}`);
      }
    },

    hasApiKey(provider) {
      return !!this.getApiKey(provider);
    },

    setCloudflareConfig(config) {
      if (!hasBackend()) return;
      const data = {
        accountId: config.accountId,
        apiToken: encode(config.apiToken),
        namespaceId: config.namespaceId ?? null,
        namespaceTitle: config.namespaceTitle,
      };
      impl.setItem(`${STORAGE_PREFIX}cloudflare`, JSON.stringify(data));
    },

    getCloudflareConfig() {
      if (!hasBackend()) return null;
      const data = readJson(impl, `${STORAGE_PREFIX}cloudflare`);
      if (!data) return null;
      return {
        accountId: data.accountId,
        apiToken: decode(data.apiToken),
        namespaceId: data.namespaceId ?? null,
        namespaceTitle: data.namespaceTitle,
      };
    },

    removeCloudflareConfig() {
      if (!hasBackend()) return;
      impl.removeItem(`${STORAGE_PREFIX}cloudflare`);
    },

    hasCloudflareConfig() {
      const config = this.getCloudflareConfig();
      return !!(config && config.accountId && config.apiToken);
    },

    getSettings() {
      if (!hasBackend()) return { ...SETTINGS_DEFAULTS };
      const stored = readJson(impl, `${STORAGE_PREFIX}settings`);
      return { ...SETTINGS_DEFAULTS, ...(stored || {}) };
    },

    setSettings(settings) {
      if (!hasBackend()) return;
      const updated = { ...this.getSettings(), ...settings };
      impl.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(updated));
    },

    getFilters() {
      if (!hasBackend()) return JSON.parse(JSON.stringify(FILTERS_DEFAULTS));
      const stored = readJson(impl, `${STORAGE_PREFIX}filters`);
      return { ...JSON.parse(JSON.stringify(FILTERS_DEFAULTS)), ...(stored || {}) };
    },

    setFilters(filters) {
      if (!hasBackend()) return;
      const updated = { ...this.getFilters(), ...filters };
      impl.setItem(`${STORAGE_PREFIX}filters`, JSON.stringify(updated));
    },

    clear() {
      if (!hasBackend()) return;
      const keys = Object.keys(impl).filter((k) => k.startsWith(STORAGE_PREFIX));
      for (const k of keys) impl.removeItem(k);
    },
  };
}

export const webStorage = createStorage();
export default webStorage;
