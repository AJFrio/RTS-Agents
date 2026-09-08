/**
 * Persist a slim agent list in localStorage so the sidebar can render
 * previous repos and tasks immediately after restart, before discovery
 * finishes. Pure ESM; injectable storage for tests.
 */

export const AGENT_SNAPSHOT_STORAGE_KEY = 'rts_agent_snapshot_v1';
export const AGENT_SNAPSHOT_VERSION = 1;
export const AGENT_SNAPSHOT_MAX = 250;
const TEXT_MAX = 280;

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

function slimText(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= TEXT_MAX) return value;
  return `${value.slice(0, TEXT_MAX)}…`;
}

function toIso(value) {
  if (!value) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? undefined : value.toISOString();
  }
  return value;
}

/**
 * Drop bulky fields (transcripts, stream buffers) before persisting.
 */
export function slimAgent(agent) {
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

export function loadAgentSnapshot(storage = globalThis.localStorage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return [];
    const raw = storage.getItem(AGENT_SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== AGENT_SNAPSHOT_VERSION) return [];
    if (!Array.isArray(parsed.agents)) return [];
    return parsed.agents.map(slimAgent).filter(Boolean).slice(0, AGENT_SNAPSHOT_MAX);
  } catch {
    return [];
  }
}

export function saveAgentSnapshot(agents, storage = globalThis.localStorage) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const slim = (Array.isArray(agents) ? agents : [])
      .map(slimAgent)
      .filter(Boolean)
      .slice(0, AGENT_SNAPSHOT_MAX);
    storage.setItem(
      AGENT_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: AGENT_SNAPSHOT_VERSION,
        savedAt: new Date().toISOString(),
        agents: slim,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function countsFromAgents(agents) {
  const counts = {
    antigravity: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    opencode: 0,
    total: 0,
  };
  for (const agent of Array.isArray(agents) ? agents : []) {
    counts.total += 1;
    if (agent?.provider && typeof counts[agent.provider] === 'number') {
      counts[agent.provider] += 1;
    }
  }
  return counts;
}
