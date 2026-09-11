/**
 * Filesystem vs git-remote helpers for attaching `repoRemote` on local tasks.
 * Mirrors the renderer parser enough to canonicalize origin URLs.
 */

const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;
const UNC = /^\\\\/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function slugifyRepoName(name) {
  return String(name || '')
    .trim()
    .replace(/\.git$/i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isFilesystemPath(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^file:/i.test(text)) return true;
  if (WINDOWS_ABS.test(text) || UNC.test(text)) return true;
  if (HAS_SCHEME.test(text)) return false;
  if (text.startsWith('git@')) return false;
  if (text.startsWith('/') || text.startsWith('~/')) return true;
  return false;
}

function normalizeLocalPath(value) {
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

function remoteKey(host, owner, name) {
  const slug = slugifyRepoName(name);
  const ownerKey = String(owner || '').trim();
  const hostKey = String(host || 'github.com')
    .replace(/^www\./i, '')
    .toLowerCase();
  if (!ownerKey || !slug) return null;
  return `${hostKey}/${ownerKey.toLowerCase()}/${slug}`;
}

/**
 * Turn a git remote URL into `host/owner/repo` (lowercase, no .git).
 */
function canonicalizeGitRemote(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const ssh = text.match(/^git@([^:]+):(.+)$/i);
  if (ssh) {
    const rest = ssh[2].replace(/\.git$/i, '').replace(/^\/+/, '');
    const parts = rest.split('/').filter(Boolean);
    if (parts.length >= 2) return remoteKey(ssh[1], parts[0], parts[1]);
  }

  try {
    const withScheme = HAS_SCHEME.test(text) ? text : `https://${text}`;
    const url = new URL(withScheme);
    const parts = url.pathname
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean);
    if (parts.length >= 2) return remoteKey(url.hostname, parts[0], parts[1]);
  } catch {
    return null;
  }
  return null;
}

function slimText(value, max = 280) {
  if (typeof value !== 'string') return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function toIso(value) {
  if (!value) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : value.toISOString();
  }
  return value;
}

const SLIM_KEYS = [
  'id',
  'rawId',
  'provider',
  'name',
  'status',
  'repository',
  'repoRemote',
  'branch',
  'prUrl',
  'createdAt',
  'updatedAt',
  'summary',
  'prompt',
  'webUrl',
  'url',
  'filePath',
  'source',
];

function slimAgent(agent) {
  if (!agent || typeof agent !== 'object') return null;
  const id = agent.id || agent.rawId;
  if (!id) return null;
  const out = { id, rawId: agent.rawId || agent.id || id };
  for (const key of SLIM_KEYS) {
    if (key === 'id' || key === 'rawId') continue;
    const value = agent[key];
    if (value == null || value === '') continue;
    if (key === 'prompt' || key === 'summary' || key === 'name') {
      out[key] = slimText(value);
    } else if (key === 'createdAt' || key === 'updatedAt') {
      const iso = toIso(value);
      if (iso) out[key] = iso;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function slimAgents(agents, max = 250) {
  return (Array.isArray(agents) ? agents : []).map(slimAgent).filter(Boolean).slice(0, max);
}

module.exports = {
  isFilesystemPath,
  normalizeLocalPath,
  canonicalizeGitRemote,
  slugifyRepoName,
  slimAgent,
  slimAgents,
};
