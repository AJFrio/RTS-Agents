/**
 * Cloudflare sync surface for the web runtime — the browser counterpart of
 * src/main/ipc/register-cloudflare.js (computers list, queue activity, key
 * sync, connection test). Shapes match the desktop IPC responses exactly;
 * the KV access goes through the cloudflare-kv provider service.
 */

const SYNCED_API_KEY_PROVIDERS = new Set([
  'jules',
  'cursor',
  'codex',
  'openrouter',
  'claude',
  'github',
  'jira',
]);

export function createCloudflareSync({ storage, kv }) {
  async function testCloudflare() {
    try {
      if (!storage.hasCloudflareConfig()) {
        return {
          success: false,
          configured: false,
          error: 'Cloudflare not configured',
        };
      }
      const namespaceId = await kv.ensureNamespaceId();
      return {
        success: true,
        configured: true,
        diagnostics: { namespaceId },
      };
    } catch (err) {
      return {
        success: false,
        configured: storage.hasCloudflareConfig(),
        error: err?.message || 'Unknown error',
      };
    }
  }

  async function listComputers() {
    try {
      if (!storage.hasCloudflareConfig()) {
        return { success: true, configured: false, computers: [] };
      }

      const computers = await kv.listComputers();

      return {
        success: true,
        configured: true,
        computers: Array.isArray(computers) ? computers : [],
      };
    } catch (err) {
      return {
        success: false,
        configured: storage.hasCloudflareConfig(),
        error: err?.message || 'Unknown error',
        computers: [],
      };
    }
  }

  /**
   * Per-device remote queue length + last task status from KV (dashboard
   * visibility) — mirrors desktop 'queue:get-activity'.
   */
  async function getQueueActivity() {
    try {
      if (!storage.hasCloudflareConfig()) {
        return { success: true, configured: false, devices: [] };
      }

      const namespaceId = await kv.ensureNamespaceId();
      if (!namespaceId) {
        return { success: true, configured: true, devices: [] };
      }

      const deviceList = await kv.getDevices(namespaceId);
      const devices = Array.isArray(deviceList) ? deviceList : [];
      const tasksMap = await kv.getTasksMap(namespaceId);
      const out = [];

      for (const device of devices) {
        if (!device?.id) continue;
        const queue = await kv.getDeviceQueue(namespaceId, device.id);
        const queueLength = Array.isArray(queue) ? queue.length : 0;
        const raw = tasksMap && typeof tasksMap === 'object' ? tasksMap[device.id] : null;
        out.push({
          deviceId: device.id,
          name: device.name || device.id,
          queueLength,
          lastTask: raw
            ? {
                status: raw.status,
                tool: raw.tool,
                prompt: raw.prompt,
                error: raw.error,
                updatedAt: raw.updatedAt,
              }
            : null,
        });
      }

      return { success: true, configured: true, devices: out, updatedAt: new Date().toISOString() };
    } catch (err) {
      return {
        success: false,
        error: err?.message || 'Unknown error',
        configured: storage.hasCloudflareConfig(),
        devices: [],
      };
    }
  }

  async function pushKeysToCloudflare() {
    try {
      if (!storage.hasCloudflareConfig()) {
        return { success: false, error: 'Cloudflare not configured' };
      }
      const namespaceId = await kv.ensureNamespaceId();
      const keys = {};
      for (const provider of SYNCED_API_KEY_PROVIDERS) {
        const key = storage.getApiKey(provider);
        if (key) keys[provider] = key;
      }
      await kv.pushKeys(namespaceId, keys);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function pullKeysFromCloudflare() {
    try {
      if (!storage.hasCloudflareConfig()) {
        return { success: false, error: 'Cloudflare not configured' };
      }
      const namespaceId = await kv.ensureNamespaceId();
      const keys = await kv.pullKeys(namespaceId);

      // Update local storage with the pulled keys.
      for (const [provider, key] of Object.entries(keys || {})) {
        if (!SYNCED_API_KEY_PROVIDERS.has(provider)) continue;
        if (key) storage.setApiKey(provider, key);
      }

      return { success: true, keys };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  return {
    testCloudflare,
    listComputers,
    getQueueActivity,
    pushKeysToCloudflare,
    pullKeysFromCloudflare,
  };
}

export default createCloudflareSync;
