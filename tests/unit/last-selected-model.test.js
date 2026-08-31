/**
 * @jest-environment node
 */

const {
  getLastSelectedModel,
  setLastSelectedModel,
  LAST_MODEL_KEY_PREFIX,
} = require('../../src/renderer/utils/last-selected-model.js');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('last-selected-model', () => {
  test('stores and restores a model per harness/provider', () => {
    const storage = createMemoryStorage();
    setLastSelectedModel('codex', 'gpt-5', storage);
    setLastSelectedModel('claude-cli', 'sonnet', storage);

    expect(getLastSelectedModel('codex', storage)).toBe('gpt-5');
    expect(getLastSelectedModel('claude-cli', storage)).toBe('sonnet');
    expect(storage.getItem(`${LAST_MODEL_KEY_PREFIX}codex`)).toBe('gpt-5');
  });

  test('clearing a model removes the stored preference', () => {
    const storage = createMemoryStorage();
    setLastSelectedModel('cursor', 'composer-1', storage);
    setLastSelectedModel('cursor', '', storage);

    expect(getLastSelectedModel('cursor', storage)).toBe('');
    expect(storage.getItem(`${LAST_MODEL_KEY_PREFIX}cursor`)).toBeNull();
  });

  test('missing provider or storage returns empty string', () => {
    expect(getLastSelectedModel('', createMemoryStorage())).toBe('');
    expect(getLastSelectedModel('codex', null)).toBe('');
  });
});
