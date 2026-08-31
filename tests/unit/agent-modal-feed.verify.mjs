/**
 * Unified agent feed contract tests (Node-native, ESM).
 *
 * Runs outside jest because the renderer utils are ESM and jest is configured
 * with `transform: {}` (CommonJS only). Executed by tests/unit/run-verify.mjs
 * as part of `npm run test:ci`. Precedent: tests/unit/agent-details-cache.verify.mjs.
 *
 * Usage: node tests/unit/agent-modal-feed.verify.mjs
 */
import assert from 'node:assert/strict';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

const MODULE_PATH = '../../src/renderer/utils/agent-feed.js';

// ---------------------------------------------------------------------------
// a. merge + chronological sort (timestamp ascending)
// ---------------------------------------------------------------------------

test('merges activities, messages and conversation into one array sorted by timestamp asc', async () => {
  const { buildUnifiedFeed } = await import(MODULE_PATH);
  const feed = buildUnifiedFeed({
    activities: [
      { id: 'a2', title: 'Later activity', description: 'd2', timestamp: '2024-01-01T03:00:00Z' },
      { id: 'a1', title: 'Early activity', description: 'd1', timestamp: '2024-01-01T00:30:00Z' },
    ],
    messages: [
      { id: 'm1', role: 'assistant', content: 'hi', createdAt: '2024-01-01T01:30:00Z' },
    ],
    conversation: [
      { id: 'c1', isUser: true, text: 'hello', timestamp: '2024-01-01T01:00:00Z' },
    ],
  });
  assert.deepEqual(feed.map((i) => i.id), ['a1', 'c1', 'm1', 'a2']);
  assert.deepEqual(feed.map((i) => i.kind), ['activity', 'conversation', 'message', 'activity']);
});

// ---------------------------------------------------------------------------
// b. untimed items after timed ones, stable source order + fallback ids
// ---------------------------------------------------------------------------

test('items without timestamps come after timestamped ones in stable source order', async () => {
  const { buildUnifiedFeed } = await import(MODULE_PATH);
  const feed = buildUnifiedFeed({
    conversation: [{ isUser: true, text: 'untimed-conv' }],
    activities: [
      { id: 'a1', title: 'timed', timestamp: '2024-01-01T00:00:00Z' },
      { title: 'untimed-act' },
    ],
    messages: [{ role: 'user', content: 'untimed-msg' }],
  });
  // Timestamped first, then untimed in stable source order
  // (activities -> messages -> conversation), with `${kind}-${index}` fallback ids.
  assert.deepEqual(feed.map((i) => i.id), ['a1', 'activity-1', 'message-0', 'conversation-0']);
  assert.equal(feed[1].title, 'untimed-act');
  assert.equal(feed[2].text, 'untimed-msg');
  assert.equal(feed[3].text, 'untimed-conv');
});

// ---------------------------------------------------------------------------
// c. null / undefined / empty inputs tolerated
// ---------------------------------------------------------------------------

test('null, undefined and empty inputs are tolerated and return an empty feed', async () => {
  const { buildUnifiedFeed } = await import(MODULE_PATH);
  assert.deepEqual(buildUnifiedFeed(), []);
  assert.deepEqual(buildUnifiedFeed(null), []);
  assert.deepEqual(buildUnifiedFeed(undefined), []);
  assert.deepEqual(buildUnifiedFeed({}), []);
  assert.deepEqual(buildUnifiedFeed({ activities: null, messages: undefined, conversation: [] }), []);
  assert.deepEqual(buildUnifiedFeed({ activities: 'not-an-array' }), []);
});

// ---------------------------------------------------------------------------
// d. duplicate ids deduped, first occurrence wins
// ---------------------------------------------------------------------------

test('duplicate ids are deduped with the first occurrence winning', async () => {
  const { buildUnifiedFeed } = await import(MODULE_PATH);
  const feed = buildUnifiedFeed({
    activities: [
      { id: 'dup', title: 'first', description: 'first-text', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'dup', title: 'second', description: 'second-text', timestamp: '2024-01-01T01:00:00Z' },
    ],
    messages: [{ id: 'dup', role: 'user', content: 'third', createdAt: '2024-01-01T02:00:00Z' }],
  });
  assert.equal(feed.length, 1, 'identical ids collapse to one item');
  assert.equal(feed[0].text, 'first-text');
});

// ---------------------------------------------------------------------------
// e. normalized shape: kind / isUser / text / timestamp (+ id, raw)
// ---------------------------------------------------------------------------

test('normalized items expose kind, isUser, text and timestamp fields', async () => {
  const { buildUnifiedFeed } = await import(MODULE_PATH);
  const feed = buildUnifiedFeed({
    activities: [{ id: 'a1', title: 'T', description: 'D', timestamp: '2024-01-01T00:00:00Z' }],
    messages: [{ id: 'm1', role: 'user', content: 'C', createdAt: '2024-01-01T01:00:00Z' }],
    conversation: [{ id: 'c1', isUser: true, text: 'X', timestamp: '2024-01-01T02:00:00Z' }],
  });
  const byId = Object.fromEntries(feed.map((i) => [i.id, i]));

  assert.equal(byId.a1.kind, 'activity');
  assert.equal(byId.a1.title, 'T');
  assert.equal(byId.a1.text, 'D');
  assert.equal(byId.a1.timestamp, Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(byId.a1.isUser, false);

  assert.equal(byId.m1.kind, 'message');
  assert.equal(byId.m1.isUser, true, 'role user maps to isUser true');
  assert.equal(byId.m1.text, 'C');
  assert.equal(byId.m1.timestamp, Date.parse('2024-01-01T01:00:00Z'));

  assert.equal(byId.c1.kind, 'conversation');
  assert.equal(byId.c1.isUser, true);
  assert.equal(byId.c1.text, 'X');

  for (const item of feed) {
    assert.ok('id' in item, 'id present');
    assert.ok('kind' in item, 'kind present');
    assert.ok('isUser' in item, 'isUser present');
    assert.ok('text' in item, 'text present');
    assert.ok('timestamp' in item, 'timestamp present');
    assert.ok('raw' in item, 'raw source preserved');
  }
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let failed = 0;
for (const { name, fn } of TESTS) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}
console.log(`\n${TESTS.length - failed}/${TESTS.length} passed`);
if (failed > 0) process.exit(1);
