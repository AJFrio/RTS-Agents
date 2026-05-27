const { ipcMain } = require('electron');
const providerHealth = require('../services/provider-health');

const SYNCED_API_KEY_PROVIDERS = new Set([
  'jules',
  'cursor',
  'codex',
  'openrouter',
  'claude',
  'github',
  'jira',
]);

function registerCloudflareHandlers(deps) {
  const { configStore, cloudflareKvService, lifecycle } = deps;
  const {
    ensureCloudflareNamespaceId,
    startCloudflareHeartbeatIfEnabled,
    stopCloudflareHeartbeat,
    initializeServices,
  } = lifecycle;

  ipcMain.handle(
    'cloudflare:set-config',
    async (event, { accountId, apiToken, namespaceTitle } = {}) => {
      const next = configStore.setCloudflareConfig({ accountId, apiToken, namespaceTitle });
      if (next?.accountId && next?.apiToken) {
        cloudflareKvService.setConfig({ accountId: next.accountId, apiToken: next.apiToken });
        startCloudflareHeartbeatIfEnabled();
      }
      return { success: true };
    }
  );

  ipcMain.handle('cloudflare:clear-config', async () => {
    configStore.clearCloudflareConfig();
    stopCloudflareHeartbeat();
    return { success: true };
  });

  ipcMain.handle('cloudflare:test', async () => {
    try {
      if (!configStore.hasCloudflareConfig()) {
        return providerHealth.notConfigured('cloudflare', {
          docsUrl: 'https://developers.cloudflare.com/api/resources/kv/',
          endpointLabel: 'GET /client/v4/accounts/:accountId/storage/kv/namespaces',
          message: 'Cloudflare not configured',
        });
      }
      const namespaceId = await ensureCloudflareNamespaceId();
      return providerHealth.ok('cloudflare', {
        configured: true,
        docsUrl: 'https://developers.cloudflare.com/api/resources/kv/',
        endpointLabel: 'GET /client/v4/accounts/:accountId/storage/kv/namespaces',
        message: 'Connected to Cloudflare KV.',
        diagnostics: { namespaceId },
      });
    } catch (err) {
      return providerHealth.fail('cloudflare', err, {
        configured: configStore.hasCloudflareConfig(),
        docsUrl: 'https://developers.cloudflare.com/api/resources/kv/',
        endpointLabel: 'GET /client/v4/accounts/:accountId/storage/kv/namespaces',
      });
    }
  });

  /**
   * Per-device remote queue length + last task status from KV (for dashboard visibility)
   */
  ipcMain.handle('queue:get-activity', async () => {
    try {
      if (!configStore.hasCloudflareConfig()) {
        return { success: true, configured: false, devices: [] };
      }

      const cfg = configStore.getCloudflareConfig();
      cloudflareKvService.setConfig({ accountId: cfg.accountId, apiToken: cfg.apiToken });
      const namespaceId = await ensureCloudflareNamespaceId();
      if (!namespaceId) {
        return { success: true, configured: true, devices: [] };
      }

      const deviceList = await cloudflareKvService.getValueJson(namespaceId, 'devices', []);
      const devices = Array.isArray(deviceList) ? deviceList : [];
      const tasksMap = await cloudflareKvService.getTasksMap(namespaceId);
      const out = [];

      for (const d of devices) {
        if (!d?.id) continue;
        const queue = await cloudflareKvService.getDeviceQueue(namespaceId, d.id);
        const qLen = Array.isArray(queue) ? queue.length : 0;
        const raw = tasksMap && typeof tasksMap === 'object' ? tasksMap[d.id] : null;
        out.push({
          deviceId: d.id,
          name: d.name || d.id,
          queueLength: qLen,
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
        error: err.message,
        configured: configStore.hasCloudflareConfig(),
        devices: [],
      };
    }
  });

  ipcMain.handle('computers:list', async () => {
    try {
      if (!configStore.hasCloudflareConfig()) {
        return { success: true, configured: false, computers: [] };
      }

      const cfg = configStore.getCloudflareConfig();
      cloudflareKvService.setConfig({ accountId: cfg.accountId, apiToken: cfg.apiToken });
      const namespaceId = await ensureCloudflareNamespaceId();
      const computers = await cloudflareKvService.getValueJson(namespaceId, 'devices', []);

      return {
        success: true,
        configured: true,
        computers: Array.isArray(computers) ? computers : [],
      };
    } catch (err) {
      return {
        success: false,
        configured: configStore.hasCloudflareConfig(),
        error: err?.message || 'Unknown error',
        computers: [],
      };
    }
  });

  ipcMain.handle('cloudflare:push-keys', async () => {
    try {
      if (!configStore.hasCloudflareConfig()) {
        return { success: false, error: 'Cloudflare not configured' };
      }
      const namespaceId = await ensureCloudflareNamespaceId();
      const keys = configStore.getAllApiKeys();
      const supportedKeys = Object.fromEntries(
        Object.entries(keys).filter(
          ([provider, key]) => SYNCED_API_KEY_PROVIDERS.has(provider) && key
        )
      );
      await cloudflareKvService.pushKeys(namespaceId, supportedKeys);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('cloudflare:pull-keys', async () => {
    try {
      if (!configStore.hasCloudflareConfig()) {
        return { success: false, error: 'Cloudflare not configured' };
      }
      const namespaceId = await ensureCloudflareNamespaceId();
      const keys = await cloudflareKvService.pullKeys(namespaceId);

      // Update local configStore with pulled keys
      for (const [provider, key] of Object.entries(keys)) {
        if (!SYNCED_API_KEY_PROVIDERS.has(provider)) continue;
        configStore.setApiKey(provider, key);
      }

      // Re-initialize services to use new keys
      initializeServices();

      return { success: true, keys };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  });
}

module.exports = { registerCloudflareHandlers };
