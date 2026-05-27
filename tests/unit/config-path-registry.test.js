const pathRegistry = require('../../src/main/services/config-path-registry');

describe('config-path-registry', () => {
  let data;

  const store = {
    get(key, defaultValue) {
      return data[key] !== undefined ? data[key] : defaultValue;
    },
    set(key, value) {
      data[key] = value;
    }
  };

  beforeEach(() => {
    data = {};
  });

  test('addPath deduplicates and removePath filters', () => {
    pathRegistry.addPath(store, 'gemini', '/a');
    pathRegistry.addPath(store, 'gemini', '/a');
    pathRegistry.addPath(store, 'gemini', '/b');

    expect(pathRegistry.getPaths(store, 'gemini')).toEqual(['/a', '/b']);

    pathRegistry.removePath(store, 'gemini', '/a');
    expect(pathRegistry.getPaths(store, 'gemini')).toEqual(['/b']);
  });

  test('getAllProjectPaths merges and deduplicates providers', () => {
    pathRegistry.addPath(store, 'antigravity', '/shared');
    pathRegistry.addPath(store, 'claude', '/shared');
    pathRegistry.addPath(store, 'github', '/only-github');

    expect(pathRegistry.getAllProjectPaths(store)).toEqual(['/shared', '/only-github']);
  });

  test('rejects unknown provider', () => {
    expect(() => pathRegistry.getPaths(store, 'unknown')).toThrow(/Unknown project path provider/);
  });
});
