/**
 * last-selected-model contract tests (Node-native, ESM).
 *
 * The renderer utility is ESM (.js with export) while jest runs with
 * `transform: {}` (CommonJS only), so this contract is verified by a
 * standalone *.verify.mjs script (precedent: tests/unit/web-platform.verify.mjs
 * and tests/unit/markdown.verify.js). Wired into `npm run test:ci` alongside
 * jest via run-verify.mjs.
 *
 * Usage: node tests/unit/last-selected-model.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  getLastSelectedModel,
  setLastSelectedModel,
  LAST_MODEL_KEY_PREFIX,
} from '../../src/renderer/utils/last-selected-model.js';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

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

test('stores and restores a model per harness/provider', () => {
  const storage = createMemoryStorage();
  setLastSelectedModel('codex', 'gpt-5', storage);
  setLastSelectedModel('claude-cli', 'sonnet', storage);

  assert.equal(getLastSelectedModel('codex', storage), 'gpt-5');
  assert.equal(getLastSelectedModel('claude-cli', storage), 'sonnet');
  assert.equal(storage.getItem(`${LAST_MODEL_KEY_PREFIX}codex`), 'gpt-5');
  assert.equal(storage.getItem(`${LAST_MODEL_KEY_PREFIX}claude-cli`), 'sonnet');
});

test('clearing a model removes the stored preference', () => {
  const storage = createMemoryStorage();
  setLastSelectedModel('cursor', 'composer-1', storage);
  setLastSelectedModel('cursor', '', storage);

  assert.equal(getLastSelectedModel('cursor', storage), '');
  assert.equal(storage.getItem(`${LAST_MODEL_KEY_PREFIX}cursor`), null);
});

test('missing provider or storage returns empty string', () => {
  assert.equal(getLastSelectedModel('', createMemoryStorage()), '');
  assert.equal(getLastSelectedModel('codex', null), '');
  assert.equal(getLastSelectedModel('codex', undefined), '');
});

// Run tests and report PASS/FAIL, exiting non-zero on failure.
let failed = 0;
for (const { name, fn } of TESTS) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

console.log(`\n${TESTS.length - failed}/${TESTS.length} passed`);
if (failed) process.exit(1);
