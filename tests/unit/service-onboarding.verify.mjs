/**
 * Service onboarding form-init + Cloudflare detect-and-connect tests.
 *
 * Renderer helpers are ESM; jest uses transform: {} (CommonJS only), so this
 * runs as a standalone *.verify.mjs (precedent: last-selected-model.verify.mjs).
 *
 * Usage: node tests/unit/service-onboarding.verify.mjs
 */
import assert from 'node:assert/strict';
import {
  cloudflareConnectSuccessMessage,
  detectAndConnectCloudflare,
  getInitialValues,
  getOnboardingModalTitle,
  shouldReseedOnboardingForm,
  verifyCloudflareConnection,
} from '../../src/renderer/components/settings/service-onboarding.js';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test('getInitialValues never seeds a Cloudflare apiToken from state', () => {
  const values = getInitialValues(
    { kind: 'cloudflare' },
    { serviceInfo: { cloudflare: { accountId: 'acc-existing', apiToken: 'should-not-appear' } } }
  );
  assert.equal(values.accountId, 'acc-existing');
  assert.equal(values.apiToken, '');
});

test('shouldReseedOnboardingForm is true only on open or service id change', () => {
  assert.equal(
    shouldReseedOnboardingForm({
      open: true,
      serviceId: 'cloudflare-sync',
      prevOpen: false,
      prevServiceId: null,
    }),
    true
  );
  assert.equal(
    shouldReseedOnboardingForm({
      open: true,
      serviceId: 'cloudflare-sync',
      prevOpen: true,
      prevServiceId: 'cloudflare-sync',
    }),
    false
  );
  assert.equal(
    shouldReseedOnboardingForm({
      open: true,
      serviceId: 'jules-cloud',
      prevOpen: true,
      prevServiceId: 'cloudflare-sync',
    }),
    true
  );
  assert.equal(
    shouldReseedOnboardingForm({
      open: false,
      serviceId: 'cloudflare-sync',
      prevOpen: true,
      prevServiceId: 'cloudflare-sync',
    }),
    false
  );
});

test('getOnboardingModalTitle uses Connect vs Manage', () => {
  assert.equal(getOnboardingModalTitle({ title: 'Cloudflare KV' }, false), 'Connect Cloudflare KV');
  assert.equal(getOnboardingModalTitle({ title: 'Cloudflare KV' }, true), 'Manage Cloudflare KV');
});

test('detectAndConnectCloudflare verifies with discovered id and the same token', async () => {
  const calls = [];
  const api = {
    discoverCloudflareAccount: async (token) => {
      calls.push(['discover', token]);
      return { success: true, accounts: [{ id: 'acc-1', name: 'Widgets' }] };
    },
    setCloudflareConfig: async (accountId, apiToken) => {
      calls.push(['set', accountId, apiToken]);
    },
    testCloudflare: async () => {
      calls.push(['test']);
      return { success: true };
    },
    clearCloudflareConfig: async () => {
      calls.push(['clear']);
    },
  };

  const result = await detectAndConnectCloudflare({ api, apiToken: '  secret-token  ' });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['discover', 'secret-token'],
    ['set', 'acc-1', 'secret-token'],
    ['test'],
  ]);
  assert.deepEqual(result.formPatch, { accountId: 'acc-1' });
  assert.equal(result.formPatch.apiToken, undefined);
  assert.equal(result.feedback.message, 'Connected to Widgets. Cloudflare KV is ready.');
});

test('token survives account fill when verify fails after detect', async () => {
  const calls = [];
  const api = {
    discoverCloudflareAccount: async (token) => {
      calls.push(['discover', token]);
      return { success: true, accounts: [{ id: 'acc-1', name: 'Widgets' }] };
    },
    setCloudflareConfig: async (accountId, apiToken) => {
      calls.push(['set', accountId, apiToken]);
    },
    testCloudflare: async () => {
      calls.push(['test']);
      return { success: false, error: 'Token lacks Workers KV Storage: Edit' };
    },
    clearCloudflareConfig: async () => {
      calls.push(['clear']);
    },
  };

  const result = await detectAndConnectCloudflare({ api, apiToken: 'secret-token' });

  assert.equal(result.ok, false);
  assert.equal(result.keepFields, true);
  assert.deepEqual(result.formPatch, { accountId: 'acc-1' });
  assert.equal(Object.prototype.hasOwnProperty.call(result.formPatch, 'apiToken'), false);
  assert.equal(result.feedback.type, 'error');
  assert.match(result.feedback.message, /Workers KV Storage/);
  assert.deepEqual(calls, [
    ['discover', 'secret-token'],
    ['set', 'acc-1', 'secret-token'],
    ['test'],
    ['clear'],
  ]);
});

test('manual verifyCloudflareConnection uses the provided account id and token', async () => {
  const calls = [];
  const api = {
    setCloudflareConfig: async (accountId, apiToken) => {
      calls.push(['set', accountId, apiToken]);
    },
    testCloudflare: async () => {
      calls.push(['test']);
      return { success: true, message: 'KV reachable' };
    },
  };

  const result = await verifyCloudflareConnection({
    api,
    accountId: 'acc-manual',
    apiToken: 'tok-manual',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['set', 'acc-manual', 'tok-manual'],
    ['test'],
  ]);
  assert.equal(result.feedback.message, 'KV reachable');
});

test('cloudflareConnectSuccessMessage formats the persistent banner', () => {
  assert.equal(
    cloudflareConnectSuccessMessage('Acme'),
    'Connected to Acme. Cloudflare KV is ready.'
  );
  assert.equal(cloudflareConnectSuccessMessage('  '), 'Connected. Cloudflare KV is ready.');
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
