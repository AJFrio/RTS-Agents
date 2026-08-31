/**
 * Collapse a flat agent list into project groups.
 *
 * The dashboard's flat list does not scale: a few hundred sessions across a
 * couple of dozen projects is unreadable as one grid. Grouping gives the
 * hierarchy people actually think in — pick the project, then the chat.
 *
 * Pure and dependency-free so it can be memoized in the renderer and tested
 * without a DOM. Filesystem work (resolving a project root) happens in the
 * main process and arrives as `agent.projectRoot`.
 */

export const UNGROUPED_KEY = '__ungrouped__';

const GITHUB_PATTERN = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/;

function lastSegment(value) {
  const segments = String(value).split(/[/\\]+/).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : String(value);
}

/**
 * Where an agent belongs. Local agents key on their resolved project root;
 * remote agents key on `owner/repo`, so cloud tasks and local sessions on the
 * same repository land together.
 */
function identify(agent) {
  const repository = agent?.repository;

  if (typeof repository === 'string') {
    const gitHub = repository.match(GITHUB_PATTERN);
    if (gitHub) return { key: `repo:${gitHub[1]}`, label: gitHub[1], path: repository };
  }

  // Resolved by the main process; falls back to the raw directory so a path
  // that matched no marker still groups on itself rather than disappearing
  // into the ungrouped bucket.
  const root = agent?.projectRoot || (repository || '').trim();
  if (root) return { key: `path:${root}`, label: lastSegment(root), path: root };

  return { key: UNGROUPED_KEY, label: 'Ungrouped', path: null };
}

function timestamp(agent) {
  const value = agent?.updatedAt || agent?.createdAt;
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @param {Array<object>} agents
 * @returns {Array<{key: string, label: string, path: string|null,
 *   agents: Array<object>, counts: object, providers: string[],
 *   lastActivity: number}>}
 */
export function groupAgentsByProject(agents) {
  if (!Array.isArray(agents) || !agents.length) return [];

  const groups = new Map();

  for (const agent of agents) {
    const { key, label, path } = identify(agent);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label,
        path,
        agents: [],
        counts: { total: 0 },
        providers: [],
        lastActivity: 0,
      };
      groups.set(key, group);
    }

    group.agents.push(agent);
    group.counts.total += 1;

    // 'stopped' reads as a failure to a person scanning for what needs
    // attention, matching the dashboard's existing status summary.
    const status = agent?.status === 'stopped' ? 'failed' : agent?.status || 'pending';
    group.counts[status] = (group.counts[status] || 0) + 1;

    if (agent?.provider && !group.providers.includes(agent.provider)) {
      group.providers.push(agent.provider);
    }

    const when = timestamp(agent);
    if (when > group.lastActivity) group.lastActivity = when;
  }

  // Newest work first, so the projects someone is actually using surface.
  // Ungrouped is a fallback bucket, not a project, so it always sorts last.
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNGROUPED_KEY) return 1;
    if (b.key === UNGROUPED_KEY) return -1;
    return b.lastActivity - a.lastActivity;
  });
}

/** Newest-first chats within a project, for the sidebar. */
export function sortAgentsByRecency(agents) {
  return [...(agents || [])].sort((a, b) => timestamp(b) - timestamp(a));
}
