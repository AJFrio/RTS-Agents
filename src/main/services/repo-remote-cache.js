/**
 * Map local project paths → canonical git remotes (`github.com/owner/repo`).
 * Lookups are async (`git config remote.origin.url`) and cached so discovery
 * polling does not spawn git on every tick.
 */

const { execFile } = require('child_process');
const {
  isFilesystemPath,
  normalizeLocalPath,
  canonicalizeGitRemote,
} = require('../utils/repo-identity');

const LOOKUP_TIMEOUT_MS = 2000;

class RepoRemoteCache {
  constructor() {
    this.remotes = new Map();
    this.pending = new Map();
    this.lookedUp = new Set();
  }

  reset() {
    this.remotes.clear();
    this.pending.clear();
    this.lookedUp.clear();
  }

  hydrate(entries) {
    if (!entries || typeof entries !== 'object') return;
    for (const [localPath, remote] of Object.entries(entries)) {
      const key = normalizeLocalPath(localPath);
      const canon = canonicalizeGitRemote(remote) || (typeof remote === 'string' ? remote : null);
      if (key && canon) this.remotes.set(key, canon);
    }
  }

  serialize() {
    return Object.fromEntries(this.remotes);
  }

  get(localPath) {
    if (!localPath) return null;
    return this.remotes.get(normalizeLocalPath(localPath)) || null;
  }

  set(localPath, remote) {
    const key = normalizeLocalPath(localPath);
    const canon = canonicalizeGitRemote(remote) || (typeof remote === 'string' && remote.includes('/') ? remote : null);
    if (!key || !canon) return;
    this.remotes.set(key, canon);
  }

  applyToAgents(agents) {
    if (!Array.isArray(agents)) return agents;
    let changed = false;
    const next = agents.map((agent) => {
      const repo = agent?.repository;
      if (!isFilesystemPath(repo)) return agent;
      const remote = this.get(repo);
      if (!remote || agent.repoRemote === remote) return agent;
      changed = true;
      return { ...agent, repoRemote: remote };
    });
    return changed ? next : agents;
  }

  lookupOrigin(localPath, exec = execFile) {
    const key = normalizeLocalPath(localPath);
    if (!key) return Promise.resolve(null);
    if (this.remotes.has(key) || this.lookedUp.has(key)) {
      return Promise.resolve(this.get(key));
    }
    if (this.pending.has(key)) return this.pending.get(key);

    const work = new Promise((resolve) => {
      exec(
        'git',
        ['-C', key, 'config', '--get', 'remote.origin.url'],
        { timeout: LOOKUP_TIMEOUT_MS, windowsHide: true },
        (error, stdout) => {
          this.lookedUp.add(key);
          this.pending.delete(key);
          if (error) {
            resolve(this.get(key));
            return;
          }
          const remote = canonicalizeGitRemote(String(stdout || '').trim());
          if (remote) this.remotes.set(key, remote);
          resolve(remote || this.get(key));
        }
      );
    });
    this.pending.set(key, work);
    return work;
  }

  /**
   * Resolve origin remotes for local paths not yet cached.
   * @returns {Promise<boolean>} true when at least one new remote was stored
   */
  async refreshMissing(agents, exec = execFile) {
    const paths = [];
    const seen = new Set();
    for (const agent of agents || []) {
      const repo = agent?.repository;
      if (!isFilesystemPath(repo)) continue;
      const key = normalizeLocalPath(repo);
      if (!key || seen.has(key) || this.remotes.has(key) || this.lookedUp.has(key)) continue;
      seen.add(key);
      paths.push(key);
    }
    if (paths.length === 0) return false;
    const before = this.remotes.size;
    await Promise.all(paths.map((p) => this.lookupOrigin(p, exec)));
    return this.remotes.size > before;
  }
}

const repoRemoteCache = new RepoRemoteCache();

module.exports = repoRemoteCache;
module.exports.RepoRemoteCache = RepoRemoteCache;
