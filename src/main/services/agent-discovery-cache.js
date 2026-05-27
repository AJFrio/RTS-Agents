const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchAllAgents } = require('../ipc/provider-registry');
const { computeAgentListDelta } = require('../utils/agent-list-delta');
const { computeLocalFingerprint, getConfigSignature } = require('./agent-discovery-fingerprint');

class AgentDiscoveryCache {
  constructor() {
    this.snapshot = null;
    this.localFingerprint = null;
    this.configSignature = null;
    this.revision = 0;
    this.lastCloudFetchAt = 0;
    this.watchers = [];
    this.invalidateDebounce = null;
  }

  invalidate() {
    this.localFingerprint = null;
    this.configSignature = null;
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
    const { configStore, geminiService, claudeService } = deps;
    const roots = new Set();
    const add = (p) => {
      if (p && typeof p === 'string') roots.add(p);
    };

    add(geminiService.getDefaultPath());
    add(claudeService.getDefaultPath());
    add(path.join(os.homedir(), '.claude', 'projects'));
    add(path.join(os.homedir(), '.opencode'));

    for (const p of configStore.getAllProjectPaths?.() || []) {
      add(p);
    }
    for (const p of configStore.getGeminiPaths?.() || []) add(p);
    for (const p of configStore.getClaudePaths?.() || []) add(p);

    return [...roots];
  }

  /**
   * fs.watch on session roots — debounced invalidation (no extra dependency).
   * @param {object} deps
   * @param {() => void} [onChange]
   */
  startWatchers(deps, onChange) {
    this.stopWatchers();
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
          this.invalidateDebounce = setTimeout(notify, 400);
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
            this.invalidateDebounce = setTimeout(notify, 400);
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

  /**
   * @param {object} deps
   * @param {{ force?: boolean, sinceRevision?: number|null }} [options]
   */
  async getAgents(deps, options = {}) {
    const { force = false, sinceRevision = null } = options;
    const { configStore } = deps;

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
