/**
 * App-state reducer contract tests (Node-native, ESM).
 *
 * Usage: node tests/unit/app-state.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  appReducer,
  initialState,
  normalizeCreatedTask,
  reconcileAgentAgainstKnown,
  resolveTaskStatus,
  syncSelectedTask,
  taskMatches,
  upsertAgent,
} from '../../src/renderer/context/app-state.js';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test('taskMatches accepts id or rawId', () => {
  assert.equal(taskMatches({ id: 'a', rawId: 'a' }, { id: 'a', rawId: 'a' }), true);
  assert.equal(taskMatches({ id: 'opencode-1', rawId: 'opencode-1' }, { id: 'opencode-1' }), true);
  assert.equal(taskMatches({ id: 'x' }, { id: 'y' }), false);
});

test('syncSelectedTask replaces the snapshot with the live agent', () => {
  const selected = { id: 't1', rawId: 't1', status: 'running', name: 'Old' };
  const agents = [{ id: 't1', rawId: 't1', status: 'completed', name: 'Old' }];
  assert.equal(syncSelectedTask(selected, agents).status, 'completed');
});

test('SET_AGENTS patches selectedTask when the same id updates', () => {
  const state = {
    ...initialState,
    selectedTask: { id: 'oc-1', rawId: 'oc-1', status: 'running', provider: 'opencode' },
    agents: [{ id: 'oc-1', rawId: 'oc-1', status: 'running', provider: 'opencode' }],
  };
  const next = appReducer(state, {
    type: 'SET_AGENTS',
    payload: {
      agents: [{ id: 'oc-1', rawId: 'oc-1', status: 'completed', provider: 'opencode' }],
      revision: 2,
    },
  });
  assert.equal(next.selectedTask.status, 'completed');
  assert.equal(next.agentListRevision, 2);
});

test('MERGE_AGENTS_DELTA patches selectedTask', () => {
  const state = {
    ...initialState,
    selectedTask: { id: 'oc-1', rawId: 'oc-1', status: 'running' },
    agents: [{ id: 'oc-1', rawId: 'oc-1', status: 'running' }],
  };
  const next = appReducer(state, {
    type: 'MERGE_AGENTS_DELTA',
    payload: {
      delta: {
        updated: [{ id: 'oc-1', rawId: 'oc-1', status: 'failed' }],
      },
      revision: 3,
    },
  });
  assert.equal(next.selectedTask.status, 'failed');
});

test('resolveTaskStatus prefers a terminal status over running', () => {
  assert.equal(resolveTaskStatus('running', 'completed'), 'completed');
  assert.equal(resolveTaskStatus('completed', 'running'), 'completed');
  assert.equal(resolveTaskStatus(undefined, 'running'), 'running');
  assert.equal(resolveTaskStatus('failed', 'running', 'completed'), 'failed');
});

test('upsertAgent inserts, merges status, and no-ops unchanged patches', () => {
  const first = upsertAgent([], { id: 't1', rawId: 't1', status: 'running', name: 'A' });
  assert.equal(first.length, 1);
  assert.equal(first[0].status, 'running');

  const updated = upsertAgent(first, { rawId: 't1', status: 'completed' });
  assert.equal(updated[0].status, 'completed');
  assert.equal(updated[0].id, 't1');
  assert.equal(updated[0].name, 'A');

  const same = upsertAgent(updated, { id: 't1', status: 'completed' });
  assert.equal(same, updated);
});

test('UPSERT_AGENT patches list and selectedTask status', () => {
  const state = {
    ...initialState,
    selectedTask: { id: 't1', rawId: 't1', status: 'running', provider: 'cursor' },
    agents: [{ id: 't1', rawId: 't1', status: 'running', provider: 'cursor' }],
  };
  const next = appReducer(state, {
    type: 'UPSERT_AGENT',
    payload: { rawId: 't1', status: 'completed' },
  });
  assert.equal(next.agents[0].status, 'completed');
  assert.equal(next.selectedTask.status, 'completed');
});

test('SET_AGENTS does not revive a newer completed row as running', () => {
  const state = {
    ...initialState,
    agents: [
      { id: 't1', rawId: 't1', status: 'completed', updatedAt: '2026-09-03T20:00:00.000Z' },
    ],
  };
  const next = appReducer(state, {
    type: 'SET_AGENTS',
    payload: {
      agents: [
        { id: 't1', rawId: 't1', status: 'running', updatedAt: '2026-09-03T19:00:00.000Z' },
      ],
    },
  });
  assert.equal(next.agents[0].status, 'completed');
});

test('reconcileAgentAgainstKnown keeps the newer terminal status', () => {
  const prev = { id: 't1', status: 'completed', updatedAt: '2026-09-03T20:00:00.000Z' };
  const stale = { id: 't1', status: 'running', updatedAt: '2026-09-03T19:00:00.000Z' };
  assert.equal(reconcileAgentAgainstKnown(prev, stale).status, 'completed');
  const newer = { id: 't1', status: 'running', updatedAt: '2026-09-03T21:00:00.000Z' };
  assert.equal(reconcileAgentAgainstKnown(prev, newer).status, 'running');
});

test('normalizeCreatedTask reads the createTask envelope', () => {
  const task = normalizeCreatedTask('cursor', {
    success: true,
    task: { id: 'cursor-cli-1', prompt: 'Fix the bug', status: 'running' },
  });
  assert.equal(task.id, 'cursor-cli-1');
  assert.equal(task.rawId, 'cursor-cli-1');
  assert.equal(task.provider, 'cursor');
  assert.equal(task.name.startsWith('Fix the bug'), true);
  assert.equal(normalizeCreatedTask('cursor', { success: true }), null);
  assert.equal(normalizeCreatedTask('cursor', { success: false, error: 'nope' }), null);
});

test('keeps selectedTask when it is missing from the new list', () => {
  const selected = { id: 'gone', status: 'running' };
  const state = { ...initialState, selectedTask: selected, agents: [selected] };
  const next = appReducer(state, {
    type: 'SET_AGENTS',
    payload: { agents: [{ id: 'other', status: 'completed' }] },
  });
  assert.deepEqual(next.selectedTask, selected);
});

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
