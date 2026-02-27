/**
 * Cloudflare KV Service (Read-Only for Mobile PWA)
 * 
 * This service does NOT register the device or send heartbeats.
 * It only reads computer/device data and can dispatch tasks to remote devices.
 */

import type { Computer, CloudflareConfig } from '../store/types';

const BASE_URL = '/api/cloudflare';
const DEFAULT_NAMESPACE_TITLE = 'rtsa';

interface CloudflareApiResponse<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: T;
  result_info?: {
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

interface Namespace {
  id: string;
  title: string;
}

interface QueuedTask {
  id: string;
  tool: string;
  repo: string;
  prompt: string;
  requestedBy: string;
  createdAt: string;
}

class CloudflareKvService {
  private config: CloudflareConfig | null = null;
  private namespaceId: string | null = null;

  setConfig(config: CloudflareConfig | null) {
    this.config = config;
    this.namespaceId = config?.namespaceId || null;
  }

  getConfig(): CloudflareConfig | null {
    return this.config;
  }

  isConfigured(): boolean {
    return !!(this.config?.accountId && this.config?.apiToken);
  }

  private async request(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<any> {
    if (!this.config?.accountId || !this.config?.apiToken) {
      throw new Error('Cloudflare KV not configured');
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CF-Account-Id': this.config.accountId,
        'X-CF-Api-Token': this.config.apiToken,
        ...options.headers,
      },
      body: options.body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare KV request failed (${response.status}): ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }

  async listNamespaces(page = 1, perPage = 100): Promise<CloudflareApiResponse<Namespace[]>> {
    return this.request(`/namespaces?page=${page}&per_page=${perPage}`);
  }

  async findNamespaceIdByTitle(title = DEFAULT_NAMESPACE_TITLE): Promise<string | null> {
    let page = 1;
    while (true) {
      const json = await this.listNamespaces(page, 100);
      const found = (json.result || []).find(ns => ns?.title === title);
      if (found?.id) return found.id;

      const info = json.result_info || { total_pages: 1 };
      if (page >= info.total_pages) return null;
      page += 1;
    }
  }

  async ensureNamespaceId(title = DEFAULT_NAMESPACE_TITLE): Promise<string> {
    if (this.namespaceId) return this.namespaceId;

    const namespaceId = await this.findNamespaceIdByTitle(title);
    if (!namespaceId) {
      throw new Error(`Cloudflare KV namespace "${title}" not found. Create it from the Electron app first.`);
    }

    this.namespaceId = namespaceId;
    return namespaceId;
  }

  async ensureNamespace(title = DEFAULT_NAMESPACE_TITLE): Promise<string> {
      return this.ensureNamespaceId(title);
  }

  async getValueText(namespaceId: string, key: string): Promise<string> {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    return this.request(`/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`);
  }

  async getValueJson<T>(namespaceId: string, key: string, fallback: T | null = null): Promise<T | null> {
    try {
      const text = await this.getValueText(namespaceId, key);
      if (!text) return fallback;
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  async putValue(namespaceId: string, key: string, value: unknown): Promise<{ success: boolean }> {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    const body = typeof value === 'string' ? value : JSON.stringify(value);
    await this.request(`/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    return { success: true };
  }

  // ============================================
  // Computer/Device Methods (Read-Only)
  // ============================================

  async getDevices(namespaceId?: string): Promise<Computer[]> {
    const nsId = namespaceId || (await this.ensureNamespaceId());
    const devices = await this.getValueJson<Computer[]>(nsId, 'devices', []);
    return devices || [];
  }

  async listComputers(): Promise<Computer[]> {
    return this.getDevices();
  }

  // ============================================
  // Remote Task Queue Methods
  // ============================================

  private queueKey(deviceId: string): string {
    if (!deviceId) throw new Error('Missing deviceId for queue key');
    return `queue:${deviceId}`;
  }

  async getDeviceQueue(namespaceId: string, deviceId: string): Promise<QueuedTask[]> {
    return this.getValueJson(namespaceId, this.queueKey(deviceId), []) as Promise<QueuedTask[]>;
  }

  async putDeviceQueue(namespaceId: string, deviceId: string, queue: QueuedTask[]): Promise<{ success: boolean }> {
    if (!Array.isArray(queue)) throw new Error('Queue must be an array');
    return this.putValue(namespaceId, this.queueKey(deviceId), queue);
  }

  async enqueueDeviceTask(
    deviceId: string,
    task: {
      tool: string;
      repo: string;
      prompt: string;
      requestedBy?: string;
    }
  ): Promise<QueuedTask[]> {
    const namespaceId = await this.ensureNamespaceId();
    const queue = await this.getDeviceQueue(namespaceId, deviceId);

    const newTask: QueuedTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tool: task.tool,
      repo: task.repo,
      prompt: task.prompt,
      requestedBy: task.requestedBy || 'mobile-pwa',
      createdAt: new Date().toISOString(),
    };

    const next = Array.isArray(queue) ? [...queue, newTask] : [newTask];
    await this.putDeviceQueue(namespaceId, deviceId, next);
    return next;
  }

  // ============================================
  // Task Status Methods
  // ============================================

  async getTasksMap(namespaceId: string): Promise<Record<string, unknown>> {
    const tasks = await this.getValueJson<Record<string, unknown>>(namespaceId, 'tasks', {});
    return tasks && typeof tasks === 'object' && !Array.isArray(tasks) ? tasks : {};
  }

  async getDeviceTaskStatus(deviceId: string): Promise<unknown> {
    const namespaceId = await this.ensureNamespaceId();
    const tasks = await this.getTasksMap(namespaceId);
    return tasks[deviceId] || null;
  }

  // ============================================
  // API Keys Sync Methods
  // ============================================

  /**
   * Pull API keys from KV store
   * Keys are stored by the Electron app via pushKeys
   */
  async pullKeys(): Promise<Record<string, string>> {
    const namespaceId = await this.ensureNamespaceId();
    const keys = await this.getValueJson<Record<string, string>>(namespaceId, 'keys', {});
    return keys || {};
  }

  /**
   * Check if keys exist in KV store
   */
  async hasStoredKeys(): Promise<boolean> {
    try {
      const keys = await this.pullKeys();
      return Object.keys(keys).length > 0;
    } catch {
      return false;
    }
  }

  // ============================================
  // Connection Test
  // ============================================

  async testConnection(): Promise<{ success: boolean; error?: string; namespaceId?: string }> {
    try {
      const namespaceId = await this.ensureNamespaceId();
      return { success: true, namespaceId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}

export const cloudflareKvService = new CloudflareKvService();
export default cloudflareKvService;
