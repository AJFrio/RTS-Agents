/**
 * Agent snapshot cache contract tests (Node-native, ESM).
 *
 * Usage: node tests/unit/agent-snapshot-cache.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  AGENT_SNAPSHOT_STORAGE_KEY,
  countsFromAgents,
  loadAgentSnapshot,
  saveAgentSnapshot,
  slimAgent,
} from '../../src/renderer/utils/agent-snapshot-cache.js';

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

test('slimAgent drops transcripts and truncates long prompts', () => {
  const slim = slimAgent({
    id: 't1',
    rawId: 't1',
    provider: 'cursor',
    name: 'Task',
    status: 'running',
    repository: '/tmp/open-shop',
    prompt: 'x'.repeat(400),
    streamMessages: [{ role: 'assistant', content: 'secret' }],
    createdAt: new Date('2026-09-08T12:00:00.000Z'),
  });
  assert.equal(slim.id, 't1');
  assert.equal(slim.streamMessages, undefined);
  assert.equal(slim.prompt.endsWith('…'), true);
  assert.equal(slim.prompt.length, 281);
  assert.equal(slim.createdAt, '2026-09-08T12:00:00.000Z');
});

test('round-trips a slim list through storage', () => {
  const storage = createMemoryStorage();
  const agents = [
    {
      id: 'local-1',
      provider: 'claude-cli',
      status: 'running',
      repository: 'D:\\GitHub\\Open Shop',
      name: 'Local',
    },
    {
      id: 'cloud-1',
      provider: 'cursor',
      status: 'completed',
      repository: 'https://github.com/ajfrio/open-shop',
      name: 'Cloud',
    },
  ];
  assert.equal(saveAgentSnapshot(agents, storage), true);
  const raw = JSON.parse(storage.getItem(AGENT_SNAPSHOT_STORAGE_KEY));
  assert.equal(raw.version, 1);
  const loaded = loadAgentSnapshot(storage);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].id, 'local-1');
  assert.equal(loaded[1].repository, 'https://github.com/ajfrio/open-shop');
});

test('loadAgentSnapshot returns [] for missing or corrupt data', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadAgentSnapshot(storage), []);
  storage.setItem(AGENT_SNAPSHOT_STORAGE_KEY, '{not json');
  assert.deepEqual(loadAgentSnapshot(storage), []);
  storage.setItem(AGENT_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 99, agents: [{}] }));
  assert.deepEqual(loadAgentSnapshot(storage), []);
});

test('countsFromAgents tallies known providers', () => {
  const counts = countsFromAgents([
    { provider: 'cursor' },
    { provider: 'cursor' },
    { provider: 'claude-cli' },
    { provider: 'unknown' },
  ]);
  assert.equal(counts.total, 4);
  assert.equal(counts.cursor, 2);
  assert.equal(counts['claude-cli'], 1);
  assert.equal(counts.jules, 0);
});

let failed = 0;
for (const { name, fn } of TESTS) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

console.log(`\n${TESTS.length - failed}/${TESTS.length} passed`);
if (failed) process.exit(1);
