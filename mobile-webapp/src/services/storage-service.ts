/**
 * Storage Service
 * 
 * Handles secure storage of API keys and settings using localStorage.
 * Uses simple obfuscation (base64) to deter casual access.
 * Note: This is NOT true encryption - for sensitive data, consider
 * using a backend service or the Web Crypto API.
 */

import type { AppSettings, CloudflareConfig } from '../store/types';

const STORAGE_PREFIX = 'rts_agents_';

// Simple obfuscation (base64 encode/decode)
function encode(value: string): string {
  try {
    return btoa(value);
  } catch {
    return value;
  }
}

function decode(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
}

class StorageService {
  // ============================================
  // API Keys
  // ============================================

  setApiKey(provider: string, key: string): void {
    if (key) {
      localStorage.setItem(`${STORAGE_PREFIX}key_${provider}`, encode(key));
    } else {
      localStorage.removeItem(`${STORAGE_PREFIX}key_${provider}`);
    }
  }

  getApiKey(provider: string): string | null {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}key_${provider}`);
    if (!stored) return null;
    return decode(stored);
  }

  removeApiKey(provider: string): void {
    localStorage.removeItem(`${STORAGE_PREFIX}key_${provider}`);
  }

  hasApiKey(provider: string): boolean {
    return !!this.getApiKey(provider);
  }

  getApiKeyStatus(): Record<string, boolean> {
    return {
      jules: this.hasApiKey('jules'),
      cursor: this.hasApiKey('cursor'),
      codex: this.hasApiKey('codex'),
      claude: this.hasApiKey('claude'),
      github: this.hasApiKey('github'),
      cloudflare: this.hasCloudflareConfig(),
    };
  }

  // ============================================
  // Cloudflare Config
  // ============================================

  setCloudflareConfig(config: CloudflareConfig): void {
    const data = {
      accountId: config.accountId,
      apiToken: encode(config.apiToken),
      namespaceId: config.namespaceId,
      namespaceTitle: config.namespaceTitle,
    };
    localStorage.setItem(`${STORAGE_PREFIX}cloudflare`, JSON.stringify(data));
  }

  getCloudflareConfig(): CloudflareConfig | null {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}cloudflare`);
    if (!stored) return null;

    try {
      const data = JSON.parse(stored);
      return {
        accountId: data.accountId,
        apiToken: decode(data.apiToken),
        namespaceId: data.namespaceId,
        namespaceTitle: data.namespaceTitle,
      };
    } catch {
      return null;
    }
  }

  removeCloudflareConfig(): void {
    localStorage.removeItem(`${STORAGE_PREFIX}cloudflare`);
  }

  hasCloudflareConfig(): boolean {
    const config = this.getCloudflareConfig();
    return !!(config?.accountId && config?.apiToken);
  }

  // ============================================
  // App Settings
  // ============================================

  getSettings(): AppSettings {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}settings`);
    const defaults: AppSettings = {
      pollingInterval: 30000,
      autoPolling: true,
      theme: 'system',
    };

    if (!stored) return defaults;

    try {
      return { ...defaults, ...JSON.parse(stored) };
    } catch {
      return defaults;
    }
  }

  setSettings(settings: Partial<AppSettings>): void {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(updated));
  }

  setPollingInterval(interval: number): void {
    this.setSettings({ pollingInterval: interval });
  }

  setAutoPolling(enabled: boolean): void {
    this.setSettings({ autoPolling: enabled });
  }

  setTheme(theme: 'system' | 'light' | 'dark'): void {
    this.setSettings({ theme });
  }

  // ============================================
  // Filter Settings
  // ============================================

  getFilters(): {
    providers: Record<string, boolean>;
    statuses: Record<string, boolean>;
    search: string;
  } {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}filters`);
    const defaults = {
      providers: {
        jules: true,
        cursor: true,
        codex: true,
        'claude-cloud': true,
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

    if (!stored) return defaults;

    try {
      return { ...defaults, ...JSON.parse(stored) };
    } catch {
      return defaults;
    }
  }

  setFilters(filters: Partial<{
    providers: Record<string, boolean>;
    statuses: Record<string, boolean>;
    search: string;
  }>): void {
    const current = this.getFilters();
    const updated = { ...current, ...filters };
    localStorage.setItem(`${STORAGE_PREFIX}filters`, JSON.stringify(updated));
  }

  // ============================================
  // Utility
  // ============================================

  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  }
}

export const storageService = new StorageService();
export default storageService;
