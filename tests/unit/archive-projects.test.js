/**
 * Archive reducer behaviour. app-state.js is renderer ES module source, so it
 * is evaluated directly (same approach as transcript.test.js), with a
 * localStorage stub since archiving persists there.
 */
const fs = require('fs');
const path = require('path');

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/context/app-state.js'),
  'utf-8'
);
const factory = new Function(
  `${source.replace(/export function/g, 'function').replace(/export const/g, 'const')}
   return { appReducer, initialState };`
);

function fresh() {
  store.clear();
  return factory();
}

describe('project archiving', () => {
  test('archives a project and persists the key', () => {
    const { appReducer, initialState } = fresh();

    const next = appReducer(initialState, {
      type: 'TOGGLE_PROJECT_ARCHIVED',
      payload: 'path:/a',
    });

    expect(next.archivedProjects).toEqual(['path:/a']);
    expect(JSON.parse(store.get('rts_archived_projects_v1'))).toEqual(['path:/a']);
  });

  test('toggling an archived project restores it', () => {
    const { appReducer, initialState } = fresh();

    const archived = appReducer(initialState, {
      type: 'TOGGLE_PROJECT_ARCHIVED',
      payload: 'path:/a',
    });
    const restored = appReducer(archived, {
      type: 'TOGGLE_PROJECT_ARCHIVED',
      payload: 'path:/a',
    });

    expect(restored.archivedProjects).toEqual([]);
  });

  test('archiving the project you are viewing returns you to the grid', () => {
    const { appReducer, initialState } = fresh();
    const viewing = { ...initialState, selectedProjectKey: 'path:/a' };

    const next = appReducer(viewing, { type: 'TOGGLE_PROJECT_ARCHIVED', payload: 'path:/a' });

    expect(next.selectedProjectKey).toBeNull();
  });

  test('archiving a different project leaves the current selection alone', () => {
    const { appReducer, initialState } = fresh();
    const viewing = { ...initialState, selectedProjectKey: 'path:/a' };

    const next = appReducer(viewing, { type: 'TOGGLE_PROJECT_ARCHIVED', payload: 'path:/b' });

    expect(next.selectedProjectKey).toBe('path:/a');
  });

  test('restoring while viewing keeps you where you are', () => {
    const { appReducer, initialState } = fresh();
    const state = {
      ...initialState,
      archivedProjects: ['path:/a'],
      selectedProjectKey: 'path:/a',
    };

    const next = appReducer(state, { type: 'TOGGLE_PROJECT_ARCHIVED', payload: 'path:/a' });

    expect(next.archivedProjects).toEqual([]);
    expect(next.selectedProjectKey).toBe('path:/a');
  });

  test('keeps archived keys sorted and deduplicated', () => {
    const { appReducer, initialState } = fresh();

    let state = appReducer(initialState, { type: 'TOGGLE_PROJECT_ARCHIVED', payload: 'path:/z' });
    state = appReducer(state, { type: 'TOGGLE_PROJECT_ARCHIVED', payload: 'path:/a' });

    expect(state.archivedProjects).toEqual(['path:/a', 'path:/z']);
  });

  test('show-archived is a view toggle that does not change what is archived', () => {
    const { appReducer, initialState } = fresh();
    const state = { ...initialState, archivedProjects: ['path:/a'] };

    const next = appReducer(state, { type: 'SET_SHOW_ARCHIVED_PROJECTS', payload: true });

    expect(next.showArchivedProjects).toBe(true);
    expect(next.archivedProjects).toEqual(['path:/a']);
  });
});
