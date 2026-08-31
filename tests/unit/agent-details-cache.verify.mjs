/**
 * Agent details cache contract tests (Node-native, ESM).
 *
 * Runs outside jest because the renderer context helpers are ESM and jest is
 * configured with `transform: {}` (CommonJS only). Executed by
 * tests/unit/run-verify.mjs as part of `npm run test:ci`.
 * Precedent: tests/unit/web-platform.verify.mjs.
 *
 * Usage: node tests/unit/agent-details-cache.verify.mjs
 */
import assert from 'node:assert/strict';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

const MODULE_PATH = '../../src/renderer/context/helpers/agent-details-cache.js';

/** Drain pending microtasks/immediates so fire-and-forget primes settle. */
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Electron-api stub recording jules + generic detail calls. */
function makeApi({ julesResult, genericResult, genericError } = {}) {
  const calls = { jules: [], generic: [] };
  return {
    calls,
    async getJulesAgentDetailsText(sessionId) {
      calls.jules.push(sessionId);
      if (julesResult === undefined) return { details: { content: `jules:${sessionId}` } };
      return julesResult;
    },
    async getAgentDetails(provider, rawId, filePath) {
      calls.generic.push({ provider, rawId, filePath });
      if (genericError) throw genericError;
      if (genericResult === undefined) {
        return { details: { summary: `generic:${provider}:${rawId}` } };
      }
      return genericResult;
    },
  };
}

/** Injected fetchDetails with manually-resolved promises (dedupe tests). */
function makeDeferredFetch() {
  const calls = [];
  const resolvers = [];
  const fn = (_api, agent) => {
    calls.push(agent);
    return new Promise((resolve) => resolvers.push(resolve));
  };
  fn.calls = calls;
  fn.resolvers = resolvers;
  return fn;
}

/** Injected fetchDetails resolving to a fixed (pre-normalized) value. */
function makeStubFetch(result) {
  const calls = [];
  const fn = async (_api, agent) => {
    calls.push(agent);
    return result;
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// a. prime fetches only running agents
// ---------------------------------------------------------------------------

test('prime fetches ONLY agents with status running', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const api = makeApi();
  const cache = createAgentDetailsCache({ api });
  cache.prime([
    { provider: 'cursor', rawId: 'c1', status: 'running' },
    { provider: 'codex', rawId: 'x1', status: 'completed' },
    { provider: 'claude-cli', rawId: 'l1', status: 'failed' },
    { provider: 'jules', rawId: 'j1', status: 'pending' },
  ]);
  await flush();
  assert.equal(api.calls.generic.length, 1, 'exactly one running agent fetched');
  assert.equal(api.calls.generic[0].rawId, 'c1');
  assert.equal(api.calls.jules.length, 0);
});

// ---------------------------------------------------------------------------
// b. key format provider:rawId + result?.details ?? result normalization
// ---------------------------------------------------------------------------

test('entries are keyed provider:rawId and get() unwraps the details envelope', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const api = makeApi(); // resolves { details: { summary: 'generic:...' } }
  const cache = createAgentDetailsCache({ api });
  cache.prime([{ provider: 'cursor', rawId: 'ag1', status: 'running' }]);
  await flush();
  assert.equal(cache.has('cursor', 'ag1'), true);
  assert.deepEqual(cache.get('cursor', 'ag1'), { summary: 'generic:cursor:ag1' });
  assert.equal(cache.get('cursor', 'unknown'), null);
  assert.equal(cache.has('cursor', 'unknown'), false);
});

test('raw results without a details envelope are stored as-is', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const api = makeApi({ genericResult: { summary: 'raw-envelope' } });
  const cache = createAgentDetailsCache({ api });
  cache.prime([{ provider: 'codex', rawId: 't1', status: 'running' }]);
  await flush();
  assert.deepEqual(cache.get('codex', 't1'), { summary: 'raw-envelope' });
});

// ---------------------------------------------------------------------------
// c. jules routing with the jules- prefix stripped from the session id
// ---------------------------------------------------------------------------

test('jules agents route through the jules fetcher with the jules- prefix stripped', async () => {
  const { fetchAgentDetails } = await import(MODULE_PATH);
  const api = makeApi();

  const stripped = await fetchAgentDetails(api, {
    provider: 'jules',
    rawId: 'jules-s1',
    id: 'jules-s1',
  });
  assert.deepEqual(api.calls.jules, ['s1'], 'jules- prefix stripped for the session id');
  assert.deepEqual(api.calls.generic, []);
  assert.deepEqual(stripped, { content: 'jules:s1' });

  await fetchAgentDetails(api, { provider: 'jules', rawId: 's9', id: 'jules-s9' });
  assert.deepEqual(api.calls.jules, ['s1', 's9'], 'unprefixed rawId passes through');

  const generic = await fetchAgentDetails(api, {
    provider: 'cursor',
    rawId: 'ag1',
    filePath: '/repo',
  });
  assert.deepEqual(api.calls.generic, [{ provider: 'cursor', rawId: 'ag1', filePath: '/repo' }]);
  assert.deepEqual(generic, { summary: 'generic:cursor:ag1' });
});

test('cache primes jules agents end-to-end keeping the unstripped cache key', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const api = makeApi();
  const cache = createAgentDetailsCache({ api });
  cache.prime([{ provider: 'jules', rawId: 'jules-s1', id: 'jules-s1', status: 'running' }]);
  await flush();
  assert.deepEqual(api.calls.jules, ['s1']);
  assert.equal(cache.has('jules', 'jules-s1'), true);
  assert.deepEqual(cache.get('jules', 'jules-s1'), { content: 'jules:s1' });
});

// ---------------------------------------------------------------------------
// d. in-flight dedupe across concurrent primes
// ---------------------------------------------------------------------------

test('concurrent primes dedupe in-flight fetches to one per agent', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const fetchDetails = makeDeferredFetch();
  const cache = createAgentDetailsCache({ fetchDetails });
  const agents = [
    { provider: 'cursor', rawId: 'c1', status: 'running' },
    { provider: 'codex', rawId: 'x1', status: 'running' },
  ];

  cache.prime(agents);
  cache.prime(agents);
  cache.prime(agents);

  assert.equal(fetchDetails.calls.length, 2, 'one fetch per agent while in flight');
  fetchDetails.resolvers.forEach((resolve) => resolve({ ok: true }));
  await flush();

  assert.deepEqual(cache.get('cursor', 'c1'), { ok: true });
  assert.deepEqual(cache.get('codex', 'x1'), { ok: true });

  // Cached entries are never re-fetched: the refresh loop primes on every tick.
  cache.prime(agents);
  await flush();
  assert.equal(fetchDetails.calls.length, 2, 'cached agents are not re-fetched');
});

// ---------------------------------------------------------------------------
// e. fetch rejection swallowed silently
// ---------------------------------------------------------------------------

test('fetch rejection is swallowed; cache unaffected; non-running agents untouched', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const calls = [];
  const fetchDetails = async (_api, agent) => {
    calls.push(agent.rawId);
    if (agent.rawId === 'bad') throw new Error('boom');
    return { summary: `ok:${agent.rawId}` };
  };
  const cache = createAgentDetailsCache({ fetchDetails });

  assert.doesNotThrow(() =>
    cache.prime([
      { provider: 'cursor', rawId: 'bad', status: 'running' },
      { provider: 'cursor', rawId: 'good', status: 'running' },
      { provider: 'codex', rawId: 'done', status: 'completed' },
    ])
  );
  await flush();

  assert.deepEqual(calls.slice().sort(), ['bad', 'good'], 'non-running agent never fetched');
  assert.equal(cache.has('cursor', 'bad'), false);
  assert.equal(cache.get('cursor', 'bad'), null);
  assert.deepEqual(cache.get('cursor', 'good'), { summary: 'ok:good' });
});

// ---------------------------------------------------------------------------
// f. running -> completed transitions retain the cached entry
// ---------------------------------------------------------------------------

test('entry for an agent transitioning running->completed is retained across primes', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const fetchDetails = makeStubFetch({ summary: 'snapshot' });
  const cache = createAgentDetailsCache({ fetchDetails });

  cache.prime([{ provider: 'cursor', rawId: 'c1', status: 'running' }]);
  await flush();
  assert.deepEqual(cache.get('cursor', 'c1'), { summary: 'snapshot' });

  cache.prime([{ provider: 'cursor', rawId: 'c1', status: 'completed' }]);
  await flush();
  assert.equal(cache.has('cursor', 'c1'), true, 'completed agent entry is not evicted');
  assert.deepEqual(cache.get('cursor', 'c1'), { summary: 'snapshot' });
  assert.equal(fetchDetails.calls.length, 1, 'no refetch for non-running agents');
});

// ---------------------------------------------------------------------------
// g. maxEntries cap evicts the oldest insertion
// ---------------------------------------------------------------------------

test('maxEntries cap evicts the oldest insertion', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const fetchDetails = makeStubFetch({ summary: 'x' });
  const cache = createAgentDetailsCache({ fetchDetails, maxEntries: 2 });

  cache.prime([
    { provider: 'cursor', rawId: 'a', status: 'running' },
    { provider: 'cursor', rawId: 'b', status: 'running' },
  ]);
  await flush();
  assert.equal(cache.has('cursor', 'a'), true);
  assert.equal(cache.has('cursor', 'b'), true);

  cache.prime([{ provider: 'cursor', rawId: 'c', status: 'running' }]);
  await flush();
  assert.equal(cache.has('cursor', 'a'), false, 'oldest entry evicted');
  assert.equal(cache.get('cursor', 'a'), null);
  assert.equal(cache.has('cursor', 'b'), true);
  assert.equal(cache.has('cursor', 'c'), true);
});

test('clear() empties the cache', async () => {
  const { createAgentDetailsCache } = await import(MODULE_PATH);
  const cache = createAgentDetailsCache({ fetchDetails: makeStubFetch({ summary: 's' }) });
  cache.prime([{ provider: 'cursor', rawId: 'a', status: 'running' }]);
  await flush();
  assert.equal(cache.has('cursor', 'a'), true);
  cache.clear();
  assert.equal(cache.has('cursor', 'a'), false);
  assert.equal(cache.get('cursor', 'a'), null);
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
