const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchAllAgents } = require('../ipc/provider-registry');
const { computeAgentListDelta } = require('../utils/agent-list-delta');
const { slimAgents } = require('../utils/repo-identity');
const { computeLocalFingerprint, getConfigSignature } = require('./agent-discovery-fingerprint');
const repoRemoteCache = require('./repo-remote-cache');

const WATCH_DEBOUNCE_MS = 2000;
const PERSIST_DEBOUNCE_MS = 400;
const SNAPSHOT_VERSION = 1;

class AgentDiscoveryCache {
  constructor() {
    this.snapshot = null;
    this.localFingerprint = null;
    this.configSignature = null;
    this.revision = 0;
    this.lastCloudFetchAt = 0;
    this.watchers = [];
    this.invalidateDebounce = null;
    this.persistPath = null;
    this.persistTimer = null;
    this.hydrated = false;
    this.onSnapshotChange = null;
    this.remoteCache = repoRemoteCache;
    this.refreshRemotesInFlight = null;
  }

  configurePersist({ persistPath } = {}) {
    this.persistPath = persistPath || null;
  }

  invalidate() {
    this.localFingerprint = null;
    this.configSignature = null;
  }

  /** In-memory snapshot for Janus — no provider rescan. */
  peekAgents() {
    return Array.isArray(this.snapshot?.agents) ? this.snapshot.agents : null;
  }

  stopWatchers() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
    this.watchers = [];
    if (this.invalidateDebounce) {
      clearTimeout(this.invalidateDebounce);
      this.invalidateDebounce = null;
    }
  }

  collectWatchRoots(deps) {
    const { configStore, antigravityService } = deps;
    const roots = new Set();
    const add = (p) => {
      if (p && typeof p === 'string') roots.add(p);
    };

    add(antigravityService.getDefaultDataPath());
    add(path.join(os.homedir(), '.claude', 'projects'));
    add(path.join(os.homedir(), '.opencode'));

    for (const p of configStore.getAntigravityPaths?.() || []) add(p);
    for (const p of configStore.getClaudePaths?.() || []) add(p);

    return [...roots];
  }

  /**
   * Load the last discovery snapshot from disk (one JSON file). Sync on
   * purpose: this runs once at window start, not on the poll path.
   */
  hydrateSync() {
    if (this.hydrated) return;
    this.hydrated = true;
    if (!this.persistPath) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SNAPSHOT_VERSION) return;
      if (parsed.remotes) this.remoteCache.hydrate(parsed.remotes);
      const agents = Array.isArray(parsed.agents) ? parsed.agents : parsed.snapshot?.agents;
      if (!Array.isArray(agents)) return;
      const counts = parsed.counts || parsed.snapshot?.counts || { total: agents.length };
      this.snapshot = {
        agents: this.remoteCache.applyToAgents(agents),
        counts,
        errors: [],
      };
      if (typeof parsed.revision === 'number' && parsed.revision > 0) {
        this.revision = parsed.revision;
      }
    } catch {
      // Missing or corrupt cache is fine — live discovery still runs.
    }
  }

  persistSoon() {
    if (!this.persistPath || !this.snapshot) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  persistNow() {
    if (!this.persistPath || !this.snapshot) return;
    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        version: SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
        revision: this.revision,
        agents: slimAgents(this.snapshot.agents),
        counts: this.snapshot.counts || {},
        remotes: this.remoteCache.serialize ? this.remoteCache.serialize() : {},
      };
      fs.writeFileSync(this.persistPath, JSON.stringify(payload));
    } catch {
      // Ignore disk failures; in-memory snapshot still serves this session.
    }
  }

  /**
   * fs.watch on session roots — debounced invalidation (no extra dependency).
   * @param {object} deps
   * @param {() => void} [onChange]
   */
  startWatchers(deps, onChange) {
    this.stopWatchers();
    this.onSnapshotChange = typeof onChange === 'function' ? onChange : null;
    this.hydrateSync();
    const roots = this.collectWatchRoots(deps);
    const notify = () => {
      this.invalidate();
      if (typeof onChange === 'function') {
        onChange();
      }
    };

    for (const root of roots) {
      try {
        const watcher = fs.watch(root, { recursive: true }, () => {
          if (this.invalidateDebounce) clearTimeout(this.invalidateDebounce);
          this.invalidateDebounce = setTimeout(notify, WATCH_DEBOUNCE_MS);
        });
        watcher.on('error', () => {
          try {
            watcher.close();
          } catch {
            // ignore
          }
        });
        this.watchers.push(watcher);
      } catch {
        try {
          const watcher = fs.watch(root, () => {
            if (this.invalidateDebounce) clearTimeout(this.invalidateDebounce);
            this.invalidateDebounce = setTimeout(notify, WATCH_DEBOUNCE_MS);
          });
          this.watchers.push(watcher);
        } catch {
          // path may not exist yet
        }
      }
    }
  }

  isCloudStale(configStore) {
    const interval = configStore.getPollingInterval?.() || 30000;
    return Date.now() - this.lastCloudFetchAt >= interval;
  }

  formatPayload(snapshot, { unchanged = false, full = false, delta = null }) {
    return {
      unchanged,
      revision: this.revision,
      full,
      agents: full ? snapshot.agents : [],
      delta,
      counts: snapshot.counts || {},
      errors: snapshot.errors || [],
    };
  }

  refreshRemotesInBackground() {
    const agents = this.snapshot?.agents;
    const cache = this.remoteCache;
    if (!agents || !cache?.refreshMissing) return;
    if (this.refreshRemotesInFlight) return this.refreshRemotesInFlight;

    this.refreshRemotesInFlight = Promise.resolve()
      .then(() => cache.refreshMissing(agents))
      .then((changed) => {
        this.refreshRemotesInFlight = null;
        if (!changed || !this.snapshot) return;
        this.snapshot = {
          ...this.snapshot,
          agents: cache.applyToAgents(this.snapshot.agents),
        };
        this.revision += 1;
        this.persistSoon();
        if (typeof this.onSnapshotChange === 'function') {
          this.onSnapshotChange();
        }
      })
      .catch(() => {
        this.refreshRemotesInFlight = null;
      });

    return this.refreshRemotesInFlight;
  }

  /**
   * @param {object} deps
   * @param {{ force?: boolean, sinceRevision?: number|null }} [options]
   */
  async getAgents(deps, options = {}) {
    const { force = false, sinceRevision = null } = options;
    const { configStore } = deps;

    if (!this.hydrated) this.hydrateSync();

    const localFp = await computeLocalFingerprint(deps);
    const configSig = getConfigSignature(configStore);
    const cloudStale = this.isCloudStale(configStore);

    const localUnchanged =
      !force &&
      this.snapshot &&
      localFp === this.localFingerprint &&
      configSig === this.configSignature &&
      !cloudStale;

    if (localUnchanged) {
      if (sinceRevision != null && sinceRevision === this.revision) {
        return this.formatPayload(this.snapshot, { unchanged: true, full: false });
      }
      return this.formatPayload(this.snapshot, { unchanged: false, full: true });
    }

    const prevAgents = this.snapshot?.agents || [];
    const prevRevision = this.revision;
    const result = await fetchAllAgents(deps);
    if (this.remoteCache?.applyToAgents) {
      result.agents = this.remoteCache.applyToAgents(result.agents);
    }
    const delta = computeAgentListDelta(prevAgents, result.agents);
    const hadSnapshot = !!this.snapshot;
    const listChanged =
      !hadSnapshot ||
      delta.added.length > 0 ||
      delta.updated.length > 0 ||
      delta.removed.length > 0;

    this.snapshot = result;
    this.localFingerprint = localFp;
    this.configSignature = configSig;
    this.lastCloudFetchAt = Date.now();

    if (listChanged) {
      this.revision += 1;
    }

    this.persistSoon();
    this.refreshRemotesInBackground();

    if (
      !force &&
      hadSnapshot &&
      listChanged &&
      sinceRevision != null &&
      sinceRevision === prevRevision
    ) {
      return this.formatPayload(result, { unchanged: false, full: false, delta });
    }

    return this.formatPayload(result, { unchanged: false, full: true });
  }
}

module.exports = new AgentDiscoveryCache();
