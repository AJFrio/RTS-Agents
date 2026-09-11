/**
 * Canonicalize repository strings from local paths and cloud URLs so the
 * sidebar can merge the same project across providers (local CLI + Cursor
 * cloud, Jules, etc.).
 *
 * Pure ESM, no DOM/electron imports — unit-tested via
 * tests/unit/repo-identity.verify.mjs.
 */

export const NO_REPO_KEY = 'No repository';

const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;
const UNC = /^\\\\/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function emptyIdentity(original = '') {
  return {
    original,
    kind: 'unknown',
    slug: '',
    name: '',
    owner: null,
    host: null,
    remote: null,
    localPath: null,
    displayName: '',
  };
}

/**
 * True when `value` looks like a filesystem path rather than a git/GitHub URL.
 */
export function isFilesystemPath(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^file:/i.test(text)) return true;
  if (WINDOWS_ABS.test(text) || UNC.test(text)) return true;
  if (HAS_SCHEME.test(text)) return false;
  if (text.startsWith('git@')) return false;
  if (text.startsWith('/') || text.startsWith('~/')) return true;
  return false;
}

export function slugifyRepoName(name) {
  return String(name || '')
    .trim()
    .replace(/\.git$/i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeLocalPath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if (/^file:\/\//i.test(text)) {
    try {
      text = decodeURIComponent(new URL(text).pathname);
      if (WINDOWS_ABS.test(text.slice(1))) text = text.slice(1);
    } catch {
      // keep original
    }
  }
  text = text.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(text)) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text;
}

function remoteIdentity(original, host, owner, name) {
  const slug = slugifyRepoName(name);
  const ownerKey = String(owner || '').trim();
  const hostKey = String(host || 'github.com')
    .replace(/^www\./i, '')
    .toLowerCase();
  const remote = ownerKey && slug ? `${hostKey}/${ownerKey.toLowerCase()}/${slug}` : null;
  return {
    original,
    kind: 'remote',
    slug,
    name: slug,
    owner: ownerKey || null,
    host: hostKey,
    remote,
    localPath: null,
    displayName: slug || name || original,
  };
}

function parseRemote(original) {
  const text = String(original || '').trim();
  if (!text) return null;

  const ssh = text.match(/^git@([^:]+):(.+)$/i);
  if (ssh) {
    const host = ssh[1];
    const rest = ssh[2].replace(/\.git$/i, '').replace(/^\/+/, '');
    const parts = rest.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return remoteIdentity(original, host, parts[0], parts[1]);
    }
  }

  const looksLikeHost =
    HAS_SCHEME.test(text) ||
    /^(www\.)?(github|gitlab|bitbucket)\./i.test(text) ||
    text.includes('://');
  if (!looksLikeHost) return null;

  try {
    const withScheme = HAS_SCHEME.test(text) ? text : `https://${text}`;
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    const host = url.hostname;
    const parts = url.pathname
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean);
    if (parts.length >= 2) {
      return remoteIdentity(original, host, parts[0], parts[1]);
    }
    if (parts.length === 1) {
      const slug = slugifyRepoName(parts[0]);
      if (!slug) return null;
      return {
        original,
        kind: 'remote',
        slug,
        name: slug,
        owner: null,
        host: host.replace(/^www\./i, '').toLowerCase(),
        remote: null,
        localPath: null,
        displayName: slug,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parse a repository field (local path, GitHub URL, SSH remote, or owner/repo).
 */
export function parseRepoIdentity(value) {
  const original = String(value || '').trim();
  if (!original) return emptyIdentity(original);

  if (/^file:/i.test(original) || isFilesystemPath(original)) {
    const normalized = normalizeLocalPath(original);
    const base = normalized.split('/').pop() || original;
    const slug = slugifyRepoName(base);
    return {
      original,
      kind: 'local',
      slug,
      name: slug,
      owner: null,
      host: null,
      remote: null,
      localPath: normalized || original,
      displayName: base.replace(/\.git$/i, '') || slug || 'Repository',
    };
  }

  const remote = parseRemote(original);
  if (remote?.slug) return remote;

  const short = original.replace(/\.git$/i, '');
  const ownerRepo = short.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (ownerRepo) {
    return remoteIdentity(original, 'github.com', ownerRepo[1], ownerRepo[2]);
  }

  const base =
    original
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() || original;
  const slug = slugifyRepoName(base);
  return {
    original,
    kind: 'unknown',
    slug,
    name: slug,
    owner: null,
    host: null,
    remote: null,
    localPath: null,
    displayName: base.replace(/\.git$/i, '') || slug || original,
  };
}

/**
 * Combine the task's `repository` with an optional git `repoRemote`.
 */
export function resolveAgentRepoIdentity(agent) {
  const primary = parseRepoIdentity(agent?.repository);
  const extra = parseRepoIdentity(agent?.repoRemote);
  const remote = extra.remote || primary.remote;
  const owner = extra.owner || primary.owner;
  const host = extra.host || primary.host;
  const slug = extra.slug || primary.slug;
  const localPath = primary.kind === 'local' ? primary.localPath : extra.localPath;
  const displayName =
    (primary.kind === 'local' && primary.displayName) ||
    extra.displayName ||
    primary.displayName ||
    slug;
  let kind = primary.kind;
  if (remote && localPath) kind = 'both';
  else if (remote) kind = 'remote';
  return {
    ...primary,
    slug,
    remote,
    owner,
    host,
    localPath,
    displayName: displayName || slug || '',
    kind,
  };
}

function remotesBySlug(resolved) {
  const map = new Map();
  for (const { identity } of resolved) {
    if (!identity.remote || !identity.slug) continue;
    if (!map.has(identity.slug)) map.set(identity.slug, new Set());
    map.get(identity.slug).add(identity.remote);
  }
  return map;
}

/**
 * Stable group key for one identity given the remote occupancy of its slug.
 *
 * Unique remote names (one `owner/repo` per slug) merge with locals of the
 * same slug. Distinct remotes that share a repo name stay separate.
 */
export function repoGroupKey(identity, slugRemotes) {
  if (!identity || (!identity.slug && !identity.remote && !identity.localPath)) {
    return NO_REPO_KEY;
  }
  const remotes = identity.slug ? slugRemotes?.get(identity.slug) : null;
  const remoteCount = remotes ? remotes.size : 0;

  if (identity.remote) {
    return remoteCount > 1 ? identity.remote : identity.slug || identity.remote;
  }
  if (identity.slug) {
    if (remoteCount === 1) return identity.slug;
    if (remoteCount > 1) return identity.localPath || identity.slug;
    return identity.slug;
  }
  return identity.localPath || NO_REPO_KEY;
}

function labelForGroup(identities, key) {
  if (key === NO_REPO_KEY) return NO_REPO_KEY;
  if (key.includes('/') && /[.]/.test(key)) {
    const parts = key.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  }
  const local = identities.find((item) => item.localPath && item.displayName);
  if (local?.displayName) return local.displayName;
  const named = identities.find((item) => item.displayName);
  return named?.displayName || key;
}

/**
 * Group tasks so local paths and cloud URLs for the same project share a row.
 *
 * @param {Array<object>} agents
 * @returns {Array<{ key: string, label: string, tasks: object[] }>}
 */
export function groupTasksByRepo(agents) {
  const resolved = (Array.isArray(agents) ? agents : []).map((agent) => ({
    agent,
    identity: resolveAgentRepoIdentity(agent),
  }));
  const slugRemotes = remotesBySlug(resolved);
  const groups = new Map();

  for (const item of resolved) {
    const key = repoGroupKey(item.identity, slugRemotes);
    if (!groups.has(key)) {
      groups.set(key, { key, tasks: [], identities: [] });
    }
    const group = groups.get(key);
    group.tasks.push(item.agent);
    group.identities.push(item.identity);
  }

  return [...groups.values()].map((group) => ({
    key: group.key,
    label: labelForGroup(group.identities, group.key),
    tasks: group.tasks,
  }));
}
