/**
 * buildCloudflareTokenUrl contract tests (Node-native, ESM).
 *
 * Verifies the deep-link used by the Cloudflare KV quick-setup flow in the
 * ServiceOnboardingModal: the Cloudflare dashboard token-creation page with
 * the Workers KV Storage: Edit permission pre-selected. Runs outside jest
 * because the renderer utils are ESM and jest is configured with
 * `transform: {}` (CommonJS only). Precedent: tests/unit/web-platform.verify.mjs.
 *
 * Usage: node tests/unit/cloudflare-token-url.verify.mjs
 */
import assert from 'node:assert/strict';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test('builds the default quick-setup token URL', async () => {
  const { buildCloudflareTokenUrl } = await import(
    '../../src/renderer/utils/cloudflare-token-url.js'
  );
  assert.equal(
    buildCloudflareTokenUrl(),
    'https://dash.cloudflare.com/profile/api-tokens' +
      '?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%5D' +
      '&accountId=*&zoneId=all&name=RTS%20Agents%20KV%20Sync'
  );
});

test('builds the token URL with a custom token name', async () => {
  const { buildCloudflareTokenUrl } = await import(
    '../../src/renderer/utils/cloudflare-token-url.js'
  );
  const url = buildCloudflareTokenUrl({ name: 'My Custom Token' });
  assert.equal(
    url,
    'https://dash.cloudflare.com/profile/api-tokens' +
      '?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%5D' +
      '&accountId=*&zoneId=all&name=My%20Custom%20Token'
  );
});

test('permissionGroupKeys query param decodes to Workers KV edit permission', async () => {
  const { buildCloudflareTokenUrl } = await import(
    '../../src/renderer/utils/cloudflare-token-url.js'
  );
  const url = new URL(buildCloudflareTokenUrl());
  assert.equal(url.origin, 'https://dash.cloudflare.com');
  assert.equal(url.pathname, '/profile/api-tokens');
  assert.equal(url.searchParams.get('accountId'), '*');
  assert.equal(url.searchParams.get('zoneId'), 'all');
  assert.deepEqual(JSON.parse(url.searchParams.get('permissionGroupKeys')), [
    { key: 'workers_kv_storage', type: 'edit' },
  ]);
});

test('custom name does not alter the pre-selected permission', async () => {
  const { buildCloudflareTokenUrl } = await import(
    '../../src/renderer/utils/cloudflare-token-url.js'
  );
  const url = new URL(buildCloudflareTokenUrl({ name: 'RTS Agents — KV' }));
  assert.equal(url.searchParams.get('name'), 'RTS Agents — KV');
  assert.deepEqual(JSON.parse(url.searchParams.get('permissionGroupKeys')), [
    { key: 'workers_kv_storage', type: 'edit' },
  ]);
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
