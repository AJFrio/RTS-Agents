/**
 * Cloudflare KV service (web runtime).
 *
 * Port of mobile-webapp/src/services/cloudflare-kv-service.ts to plain ESM
 * JS. Read-only for devices plus remote task dispatch: the web runtime does
 * NOT register itself or send heartbeats — it reads the 'devices'/'tasks'
 * KV keys the Electron app maintains, dispatches tasks into 'queue:<deviceId>'
 * and syncs API keys via the 'keys' key (desktop is the source of truth).
 * Credentials come from storage.getCloudflareConfig() and are sent via the
 * X-CF-Account-Id / X-CF-Api-Token headers through the /api/cloudflare proxy.
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = '/api/cloudflare';
const DEFAULT_NAMESPACE_TITLE = 'rtsa';

export function createCloudflareKvService({ storage, fetchImpl } = {}) {
  let cachedNamespaceId = null;

  function makeRequester(parseResponse) {
    return createRequester({
      baseUrl: BASE_URL,
      label: 'Cloudflare KV',
      fetchImpl,
      getHeaders() {
        const config = storage.getCloudflareConfig();
        if (!config?.accountId || !config?.apiToken) {
          throw new Error('Cloudflare KV not configured');
        }
        return {
          'X-CF-Account-Id': config.accountId,
          'X-CF-Api-Token': config.apiToken,
        };
      },
      parseResponse,
      formatError: async (response) =>
        `Cloudflare KV request failed (${response.status}): ${await response.text()}`,
    });
  }

  // Namespace/API responses are JSON; KV values are raw strings (a JSON value
  // must stay text so getValueJson can parse it exactly once).
  const jsonRequest = makeRequester((response) => response.json());
  const textRequest = makeRequester((response) => response.text());

  function getNamespaceTitle() {
    const configuredTitle = storage.getCloudflareConfig()?.namespaceTitle?.trim();
    return configuredTitle || DEFAULT_NAMESPACE_TITLE;
  }

  function isConfigured() {
    const config = storage.getCloudflareConfig();
    return !!(config?.accountId && config?.apiToken);
  }

  async function listNamespaces(page = 1, perPage = 100) {
    return jsonRequest(`/namespaces?page=${page}&per_page=${perPage}`);
  }

  async function findNamespaceIdByTitle(title = DEFAULT_NAMESPACE_TITLE) {
    let page = 1;
    while (true) {
      const json = await listNamespaces(page, 100);
      const found = (json.result || []).find((ns) => ns?.title === title);
      if (found?.id) return found.id;

      const info = json.result_info || { total_pages: 1 };
      if (page >= info.total_pages) return null;
      page += 1;
    }
  }

  async function ensureNamespaceId(title = getNamespaceTitle()) {
    if (cachedNamespaceId) return cachedNamespaceId;

    const configured = storage.getCloudflareConfig()?.namespaceId;
    if (configured) {
      cachedNamespaceId = configured;
      return cachedNamespaceId;
    }

    const namespaceId = await findNamespaceIdByTitle(title);
    if (!namespaceId) {
      throw new Error(
        `Cloudflare KV namespace "${title}" not found. Create it from the Electron app first.`
      );
    }

    cachedNamespaceId = namespaceId;
    return namespaceId;
  }

  async function getValueText(namespaceId, key) {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    return textRequest(`/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`);
  }

  async function getValueJson(namespaceId, key, fallback = null) {
    try {
      const text = await getValueText(namespaceId, key);
      if (!text) return fallback;
      return JSON.parse(text);
    } catch {
      // Missing key (404) or non-JSON payload — return the fallback.
      return fallback;
    }
  }

  async function putValue(namespaceId, key, value) {
    if (!namespaceId) throw new Error('Missing Cloudflare KV namespaceId');
    if (!key) throw new Error('Missing Cloudflare KV key');

    const body = typeof value === 'string' ? value : JSON.stringify(value);
    await textRequest(
      `/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`,
      'PUT',
      body,
      { 'Content-Type': 'text/plain' }
    );
    return { success: true };
  }

  // ----------------------------------------
  // Computer/Device methods (read-only)
  // ----------------------------------------

  async function getDevices(namespaceId) {
    const nsId = namespaceId || (await ensureNamespaceId());
    const devices = await getValueJson(nsId, 'devices', []);
    return devices || [];
  }

  async function listComputers() {
    return getDevices();
  }

  // ----------------------------------------
  // Remote task queue methods
  // ----------------------------------------

  function queueKey(deviceId) {
    if (!deviceId) throw new Error('Missing deviceId for queue key');
    return `queue:${deviceId}`;
  }

  async function getDeviceQueue(namespaceId, deviceId) {
    return getValueJson(namespaceId, queueKey(deviceId), []);
  }

  async function putDeviceQueue(namespaceId, deviceId, queue) {
    if (!Array.isArray(queue)) throw new Error('Queue must be an array');
    return putValue(namespaceId, queueKey(deviceId), queue);
  }

  /**
   * Appends a QueuedTask {id, tool, repo, prompt, requestedBy, createdAt} to
   * the device's queue:<deviceId> KV value and returns the resulting queue.
   */
  async function enqueueDeviceTask(deviceId, task) {
    const namespaceId = await ensureNamespaceId();
    const queue = await getDeviceQueue(namespaceId, deviceId);

    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      tool: task.tool,
      repo: task.repo,
      prompt: task.prompt,
      requestedBy: task.requestedBy || 'web-pwa',
      createdAt: new Date().toISOString(),
    };

    const next = Array.isArray(queue) ? [...queue, newTask] : [newTask];
    await putDeviceQueue(namespaceId, deviceId, next);
    return next;
  }

  // ----------------------------------------
  // Task status methods
  // ----------------------------------------

  async function getTasksMap(namespaceId) {
    const tasks = await getValueJson(namespaceId, 'tasks', {});
    return tasks && typeof tasks === 'object' && !Array.isArray(tasks) ? tasks : {};
  }

  // ----------------------------------------
  // API keys sync methods
  // ----------------------------------------

  /** Pull API keys from the KV 'keys' value (pushed by the Electron app). */
  async function pullKeys(namespaceId) {
    const nsId = namespaceId || (await ensureNamespaceId());
    const keys = await getValueJson(nsId, 'keys', {});
    return keys || {};
  }

  async function pushKeys(namespaceId, keys) {
    const nsId = namespaceId || (await ensureNamespaceId());
    return putValue(nsId, 'keys', keys);
  }

  // ----------------------------------------
  // Connection test
  // ----------------------------------------

  async function testConnection() {
    try {
      const namespaceId = await ensureNamespaceId();
      return { success: true, namespaceId };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  return {
    isConfigured,
    listNamespaces,
    findNamespaceIdByTitle,
    ensureNamespaceId,
    getValueText,
    getValueJson,
    putValue,
    getDevices,
    listComputers,
    getDeviceQueue,
    putDeviceQueue,
    enqueueDeviceTask,
    getTasksMap,
    pullKeys,
    pushKeys,
    testConnection,
  };
}

export default createCloudflareKvService;
