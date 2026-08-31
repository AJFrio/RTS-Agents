// group-agents.js is renderer ES module source; evaluated directly, matching
// the approach in transcript.test.js.
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/utils/group-agents.js'),
  'utf-8'
);
const factory = new Function(
  `${source.replace(/export function/g, 'function').replace(/export const/g, 'const')}
   return { groupAgentsByProject, UNGROUPED_KEY, partitionArchivedProjects };`
);
const { groupAgentsByProject, UNGROUPED_KEY } = factory();

const agent = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  provider: 'claude',
  status: 'completed',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('groupAgentsByProject', () => {
  test('groups local agents by their resolved project root', () => {
    const groups = groupAgentsByProject([
      agent({ projectRoot: '/Users/me/study-stack', repository: '/Users/me/study-stack/packages/a' }),
      agent({ projectRoot: '/Users/me/study-stack', repository: '/Users/me/study-stack/packages/b' }),
      agent({ projectRoot: '/Users/me/other', repository: '/Users/me/other' }),
    ]);

    expect(groups).toHaveLength(2);
    const studyStack = groups.find((g) => g.label === 'study-stack');
    expect(studyStack.agents).toHaveLength(2);
    expect(studyStack.path).toBe('/Users/me/study-stack');
  });

  test('groups remote agents by owner/repo', () => {
    const groups = groupAgentsByProject([
      agent({ provider: 'jules', repository: 'https://github.com/me/thing' }),
      agent({ provider: 'cursor', repository: 'https://github.com/me/thing.git' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('me/thing');
    expect(groups[0].agents).toHaveLength(2);
  });

  test('collects agents with no resolvable location into one ungrouped bucket', () => {
    const groups = groupAgentsByProject([
      agent({ repository: null }),
      agent({ repository: '' }),
      agent({ projectRoot: '/Users/me/real', repository: '/Users/me/real' }),
    ]);

    const ungrouped = groups.find((g) => g.key === UNGROUPED_KEY);
    expect(ungrouped.agents).toHaveLength(2);
  });

  test('sorts the ungrouped bucket last regardless of size', () => {
    const groups = groupAgentsByProject([
      agent({ repository: null }),
      agent({ repository: null }),
      agent({ repository: null }),
      agent({ projectRoot: '/Users/me/real', repository: '/Users/me/real' }),
    ]);

    expect(groups[groups.length - 1].key).toBe(UNGROUPED_KEY);
  });

  test('orders projects by most recent activity', () => {
    const groups = groupAgentsByProject([
      agent({ projectRoot: '/p/old', repository: '/p/old', updatedAt: '2026-01-01T00:00:00Z' }),
      agent({ projectRoot: '/p/new', repository: '/p/new', updatedAt: '2026-06-01T00:00:00Z' }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['new', 'old']);
  });

  test('counts agents by status for the project card', () => {
    const groups = groupAgentsByProject([
      agent({ projectRoot: '/p/x', repository: '/p/x', status: 'running' }),
      agent({ projectRoot: '/p/x', repository: '/p/x', status: 'running' }),
      agent({ projectRoot: '/p/x', repository: '/p/x', status: 'completed' }),
    ]);

    expect(groups[0].counts).toMatchObject({ total: 3, running: 2, completed: 1 });
  });

  test('falls back to the raw repository when no project root resolved', () => {
    // A local path that matched no marker still groups on itself rather than
    // collapsing into Ungrouped.
    const groups = groupAgentsByProject([
      agent({ projectRoot: null, repository: '/Users/me/loose-dir' }),
    ]);

    expect(groups[0].label).toBe('loose-dir');
    expect(groups[0].key).not.toBe(UNGROUPED_KEY);
  });

  test('returns an empty array for empty or missing input', () => {
    expect(groupAgentsByProject([])).toEqual([]);
    expect(groupAgentsByProject(null)).toEqual([]);
  });

  test('keeps agents from different providers in one project', () => {
    const groups = groupAgentsByProject([
      agent({ provider: 'claude', projectRoot: '/p/x', repository: '/p/x' }),
      agent({ provider: 'opencode', projectRoot: '/p/x', repository: '/p/x' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].providers.sort()).toEqual(['claude', 'opencode']);
  });
});

describe('partitionArchivedProjects', () => {
  const { partitionArchivedProjects } = factory();

  const group = (key, over = {}) => ({ key, label: key, agents: [], counts: { total: 1 }, ...over });

  test('splits groups into active and archived by key', () => {
    const groups = [group('path:/a'), group('path:/b'), group('path:/c')];

    const { active, archived } = partitionArchivedProjects(groups, ['path:/b']);

    expect(active.map((g) => g.key)).toEqual(['path:/a', 'path:/c']);
    expect(archived.map((g) => g.key)).toEqual(['path:/b']);
  });

  test('treats an empty archive list as everything active', () => {
    const groups = [group('path:/a'), group('path:/b')];
    const { active, archived } = partitionArchivedProjects(groups, []);

    expect(active).toHaveLength(2);
    expect(archived).toHaveLength(0);
  });

  test('ignores archived keys that no longer match a project', () => {
    // A project can disappear when its last session ages out; a stale key
    // must not error or hide anything else.
    const { active, archived } = partitionArchivedProjects([group('path:/a')], ['path:/gone']);

    expect(active.map((g) => g.key)).toEqual(['path:/a']);
    expect(archived).toHaveLength(0);
  });

  test('keeps a project active when a running agent is present', () => {
    // Archiving is for stale projects. Hiding one with live work would make
    // running agents invisible, which is worse than a slightly longer list.
    const groups = [group('path:/a', { counts: { total: 2, running: 1 } })];

    const { active, archived } = partitionArchivedProjects(groups, ['path:/a']);

    expect(active.map((g) => g.key)).toEqual(['path:/a']);
    expect(archived).toHaveLength(0);
  });

  test('handles missing input without throwing', () => {
    expect(partitionArchivedProjects(null, null)).toEqual({ active: [], archived: [] });
    expect(partitionArchivedProjects([], undefined)).toEqual({ active: [], archived: [] });
  });
});
