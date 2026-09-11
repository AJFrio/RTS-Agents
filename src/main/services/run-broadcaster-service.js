/**
 * Run broadcaster — mirrors local agent runs (from the discovery cache) into
 * the shared Cloudflare KV 'runs' log so any device — desktop or web — can
 * see all runs across cloud and local machines. Shared by main.js and
 * headless.js; the KV service owns the storage contract.
 */

const configStore = require('./config-store');
const cloudflareKvService = require('./cloudflare-kv-service');

const BROADCAST_DEBOUNCE_MS = 3000;

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running' || s === 'pending' || s === 'queued') return 'running';
  if (s === 'completed' || s === 'failed' || s === 'error') return s === 'error' ? 'failed' : s;
  return s || 'unknown';
}

/**
 * Map a discovery-cache agent to a KV run entry. Local repo paths are kept
 * as-is; cross-device consumers see the device that owns the path.
 */
function agentToRun(agent, identity) {
  const id = agent?.id || agent?.rawId;
  if (!id) return null;
  const updatedAt = agent?.updatedAt || agent?.createdAt || null;
  return {
    id: `${identity.id}:${id}`,
    localTaskId: id,
    deviceId: identity.id,
    deviceName: identity.name,
    provider: agent?.provider || null,
    name: agent?.name || 'Task',
    status: normalizeStatus(agent?.status),
    repo: agent?.repoRemote || agent?.repository || null,
    branch: agent?.branch || null,
    prUrl: agent?.prUrl || null,
    createdAt: agent?.createdAt || updatedAt,
    updatedAt,
  };
}

class RunBroadcasterService {
  constructor() {
    this.debounceTimer = null;
    this.isBroadcasting = false;
    this.pending = false;
  }

  /**
   * Broadcast a device's local runs to the KV 'runs' log. Debounced;
   * coalesces rapid snapshot changes into one write.
   */
  broadcastLocalRuns(deps, { immediate = false } = {}) {
    const { agentDiscoveryCache, ensureCloudflareNamespaceId } = deps;
    if (!configStore.hasCloudflareConfig()) return Promise.resolve(null);

    if (!immediate) {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      return new Promise((resolve) => {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          resolve(this.broadcastLocalRuns(deps, { immediate: true }));
        }, BROADCAST_DEBOUNCE_MS);
      });
    }

    if (this.isBroadcasting) {
      this.pending = true;
      return Promise.resolve(null);
    }
    this.isBroadcasting = true;

    return Promise.resolve()
      .then(async () => {
        const agents = agentDiscoveryCache.peekAgents() || [];
        const identity = configStore.getOrCreateDeviceIdentity();
        const runs = agents
          .map((agent) => agentToRun(agent, identity))
          .filter(Boolean);

        const namespaceId = await ensureCloudflareNamespaceId();
        if (!namespaceId) return null;
        return cloudflareKvService.upsertRuns(namespaceId, runs);
      })
      .then((result) => {
        this.isBroadcasting = false;
        if (this.pending) {
          this.pending = false;
          this.broadcastLocalRuns(deps, { immediate: true });
        }
        return result;
      })
      .catch((err) => {
        this.isBroadcasting = false;
        if (this.pending) {
          this.pending = false;
          this.broadcastLocalRuns(deps, { immediate: true });
        }
        console.warn('Run broadcast failed:', err?.message || err);
        return null;
      });
  }

  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

module.exports = new RunBroadcasterService();
module.exports.RunBroadcasterService = RunBroadcasterService;
module.exports.agentToRun = agentToRun;
