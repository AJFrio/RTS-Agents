/**
 * Web remote-dispatch contract tests (Node-native, ESM).
 *
 * Covers the website → Cloudflare KV → desktop queue pipeline:
 *   - createAgentHub.createRemoteTask payload shape (repo as {path}, model,
 *     attachments, autoCreatePr, branch passthrough)
 *   - cloudflare-kv-service.enqueueDeviceTask field passthrough to the KV PUT
 *
 * Runs outside jest because the renderer platform modules are ESM (.mjs) and
 * jest is configured with `transform: {}` (CommonJS only). Wired into
 * `npm run test:ci` alongside the other verify scripts.
 *
 * Usage: node tests/unit/web-remote-dispatch.verify.mjs
 */
import assert from 'node:assert/strict';

import { createAgentHub } from '../../src/renderer/platform/web-agent-hub.mjs';
import createCloudflareKvService from '../../src/renderer/platform/providers/cloudflare-kv-service.mjs';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

function makeStorage() {
  return {
    getCloudflareConfig: () => ({ accountId: 'acct', apiToken: 'tok' }),
    hasCloudflareConfig: () => true,
    getSettings: () => ({ autoPolling: false, pollingInterval: 30000 }),
    hasApiKey: () => false,
  };
}

test('createRemoteTask enqueues repo as {path} with model, attachments, autoCreatePr, and branch', async () => {
  const enqueued = [];
  const hub = createAgentHub({
    storage: makeStorage(),
    providers: {
      cloudflareKv: {
        enqueueDeviceTask: async (deviceId, task) => {
          enqueued.push({ deviceId, task });
          return [task];
        },
      },
    },
  });

  const result = await hub.createTask('claude-cli', {
    targetDeviceId: 'device-1',
    projectPath: '/home/me/project',
    prompt: 'fix the bug',
    model: 'claude-sonnet-4',
    attachments: [{ dataUrl: 'data:image/png;base64,AAA' }],
    branch: 'main',
    autoCreatePr: true,
  });

  assert.equal(result.success, true);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].deviceId, 'device-1');
  const task = enqueued[0].task;
  assert.equal(task.tool, 'claude-cli');
  assert.deepEqual(task.repo, { path: '/home/me/project' });
  assert.equal(task.prompt, 'fix the bug');
  assert.equal(task.model, 'claude-sonnet-4');
  assert.deepEqual(task.attachments, [{ dataUrl: 'data:image/png;base64,AAA' }]);
  assert.equal(task.autoCreatePr, true);
  assert.equal(task.branch, 'main');
});

test('cloudflare-kv-service.enqueueDeviceTask passes model/attachments/autoCreatePr/branch through to KV', async () => {
  const recorded = [];
  const fetchRecorder = async (url, opts = {}) => {
    if (url.includes('/values/') && opts.method === 'PUT') {
      recorded.push({ url, body: opts.body });
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    }
    if (url.includes('/namespaces?page=')) {
      return {
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({
          success: true,
          result: [{ id: 'ns-1', title: 'rtsa' }],
          result_info: { total_pages: 1 },
        }),
      };
    }
    if (url.includes('/values/')) {
      return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const kv = createCloudflareKvService({
    storage: makeStorage(),
    fetchImpl: fetchRecorder,
  });

  await kv.enqueueDeviceTask('device-1', {
    tool: 'opencode',
    repo: { path: '/home/me/project' },
    prompt: 'ship it',
    model: 'gpt-5',
    attachments: [{ dataUrl: 'data:image/png;base64,AAA' }],
    autoCreatePr: true,
    branch: 'main',
    requestedBy: 'web-pwa',
  });

  assert.equal(recorded.length, 1);
  const queued = JSON.parse(recorded[0].body);
  assert.equal(queued.length, 1);
  const task = queued[0];
  assert.equal(task.tool, 'opencode');
  assert.deepEqual(task.repo, { path: '/home/me/project' });
  assert.equal(task.prompt, 'ship it');
  assert.equal(task.model, 'gpt-5');
  assert.deepEqual(task.attachments, [{ dataUrl: 'data:image/png;base64,AAA' }]);
  assert.equal(task.autoCreatePr, true);
  assert.equal(task.branch, 'main');
  assert.ok(task.id);
  assert.ok(task.createdAt);
});

test('cloudflare-kv-service.upsertRun inserts and updates runs in the shared KV log', async () => {
  const recorded = [];
  let storedValue = null;
  const fetchRecorder = async (url, opts = {}) => {
    if (url.includes('/values/') && opts.method === 'PUT') {
      recorded.push({ url, body: opts.body });
      storedValue = opts.body;
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    }
    if (url.includes('/namespaces?page=')) {
      return {
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({
          success: true,
          result: [{ id: 'ns-1', title: 'rtsa' }],
          result_info: { total_pages: 1 },
        }),
      };
    }
    if (url.includes('/values/')) {
      return { ok: true, status: 200, text: async () => storedValue || '[]', json: async () => [] };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const kv = createCloudflareKvService({
    storage: makeStorage(),
    fetchImpl: fetchRecorder,
  });

  await kv.upsertRun(null, {
    id: 'device-1:run-a',
    deviceId: 'device-1',
    provider: 'claude-cli',
    status: 'running',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
  const firstWrite = JSON.parse(recorded[recorded.length - 1].body);
  assert.equal(firstWrite.length, 1);
  assert.equal(firstWrite[0].id, 'device-1:run-a');

  await kv.upsertRun(null, {
    id: 'device-1:run-a',
    deviceId: 'device-1',
    provider: 'claude-cli',
    status: 'completed',
    updatedAt: '2026-01-01T00:01:00Z',
  });
  const secondWrite = JSON.parse(recorded[recorded.length - 1].body);
  assert.equal(secondWrite.length, 1);
  assert.equal(secondWrite[0].status, 'completed');
  assert.equal(secondWrite[0].deviceId, 'device-1');

  await kv.upsertRun(null, {
    id: 'device-2:run-b',
    deviceId: 'device-2',
    provider: 'opencode',
    status: 'failed',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  });
  const thirdWrite = JSON.parse(recorded[recorded.length - 1].body);
  assert.equal(thirdWrite.length, 2);
  assert.equal(thirdWrite[0].id, 'device-2:run-b');
  assert.equal(thirdWrite[1].id, 'device-1:run-a');
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
