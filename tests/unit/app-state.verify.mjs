/**
 * App-state reducer contract tests (Node-native, ESM).
 *
 * Usage: node tests/unit/app-state.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  appReducer,
  initialState,
  syncSelectedTask,
  taskMatches,
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
