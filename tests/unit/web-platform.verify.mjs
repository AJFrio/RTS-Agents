/**
 * Web platform adapter contract tests (Node-native, ESM).
 *
 * Runs outside jest because the renderer platform modules are ESM (.mjs) and
 * jest is configured with `transform: {}` (CommonJS only). Wired into
 * `npm run test:ci` alongside jest. Precedent: tests/unit/markdown.verify.js.
 *
 * Usage: node tests/unit/web-platform.verify.mjs
 */
import assert from 'node:assert/strict';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

// ---------------------------------------------------------------------------
// web-storage
// ---------------------------------------------------------------------------

test('storage round-trips an API key via base64', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'secret-key-123');
  assert.equal(storage.getApiKey('jules'), 'secret-key-123');
  assert.equal(storage.hasApiKey('jules'), true);
});

test('storage removes key when set to empty string', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'abc');
  storage.setApiKey('jules', '');
  assert.equal(storage.getApiKey('jules'), null);
});

test('storage reads legacy alias keys and removes them on overwrite', async () => {
  const { createStorage, STORAGE_PREFIX } = await import(
    '../../src/renderer/platform/web-storage.mjs'
  );
  const impl = makeStorage();
  const storage = createStorage(impl);
  impl.setItem(`${STORAGE_PREFIX}key_githubToken`, Buffer.from('legacy-token').toString('base64'));
  assert.equal(storage.getApiKey('github'), 'legacy-token');

  storage.setApiKey('github', 'new-token');
  assert.equal(storage.getApiKey('github'), 'new-token');
  assert.equal(impl.getItem(`${STORAGE_PREFIX}key_githubToken`), null);
});

test('storage removes legacy aliases on removeApiKey', async () => {
  const { createStorage, STORAGE_PREFIX } = await import(
    '../../src/renderer/platform/web-storage.mjs'
  );
  const impl = makeStorage();
  const storage = createStorage(impl);
  impl.setItem(`${STORAGE_PREFIX}key_jiraToken`, 'x');
  storage.removeApiKey('jira');
  assert.equal(impl.getItem(`${STORAGE_PREFIX}key_jiraToken`), null);
  assert.equal(storage.getApiKey('jira'), null);
});

test('storage cloudflare config round-trip and presence check', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  assert.equal(storage.hasCloudflareConfig(), false);
  storage.setCloudflareConfig({
    accountId: 'acc1',
    apiToken: 'tok1',
    namespaceTitle: 'rtsa',
  });
  assert.equal(storage.hasCloudflareConfig(), true);
  const cfg = storage.getCloudflareConfig();
  assert.equal(cfg.accountId, 'acc1');
  assert.equal(cfg.apiToken, 'tok1');
  assert.equal(cfg.namespaceTitle, 'rtsa');
  storage.removeCloudflareConfig();
  assert.equal(storage.hasCloudflareConfig(), false);
});

test('storage settings and filters merge over defaults', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  const settings = storage.getSettings();
  assert.equal(settings.pollingInterval, 30000);
  assert.equal(settings.autoPolling, true);
  assert.equal(settings.theme, 'system');
  assert.equal(settings.jiraBaseUrl, '');
  assert.equal(settings.selectedModel, 'openrouter/openai/gpt-4o');

  storage.setSettings({ pollingInterval: 60000, theme: 'dark' });
  const updated = storage.getSettings();
  assert.equal(updated.pollingInterval, 60000);
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.autoPolling, true);

  const filters = storage.getFilters();
  assert.equal(filters.providers.jules, true);
  assert.equal(filters.statuses.running, true);
  assert.equal(filters.search, '');
  storage.setFilters({ search: 'foo' });
  assert.equal(storage.getFilters().search, 'foo');
  assert.equal(storage.getFilters().providers.jules, true);
});

// ---------------------------------------------------------------------------
// web-api — settings surface (mirrors src/main/ipc/register-settings.js)
// ---------------------------------------------------------------------------

test('web-api getSettings returns the flat desktop shape', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'jules-key');
  storage.setCloudflareConfig({ accountId: 'acc1', apiToken: 'tok1', namespaceTitle: 'myNs' });
  storage.setSettings({ jiraBaseUrl: 'https://jira.example.com' });
  const api = createWebApi({ storage });

  const result = await api.getSettings();

  // settings.* block
  assert.equal(result.settings.pollingInterval, 30000);
  assert.equal(result.settings.autoPolling, true);
  assert.equal(result.settings.theme, 'system');
  assert.equal(result.settings.displayMode, 'fullscreen');
  assert.equal(result.settings.selectedModel, 'openrouter/openai/gpt-4o');
  for (const key of [
    'antigravityPaths',
    'claudePaths',
    'cursorPaths',
    'codexPaths',
    'opencodePaths',
    'githubPaths',
  ]) {
    assert.deepEqual(result.settings[key], [], `settings.${key} must default to []`);
  }
  // top-level flat fields consumed by use-app-data.js
  assert.deepEqual(result.antigravityPaths, []);
  assert.deepEqual(result.claudePaths, []);
  assert.deepEqual(result.cursorPaths, []);
  assert.deepEqual(result.codexPaths, []);
  assert.deepEqual(result.opencodePaths, []);
  assert.deepEqual(result.githubPaths, []);
  assert.equal(result.antigravityInstalled, false);
  assert.equal(result.claudeCliInstalled, false);
  assert.equal(result.codexInstalled, false);
  assert.equal(result.opencodeInstalled, false);
  assert.equal(result.claudeCloudConfigured, false);
  assert.equal(result.localDeviceId, null);
  assert.equal(result.jiraBaseUrl, 'https://jira.example.com');
  assert.equal(result.selectedModel, 'openrouter/openai/gpt-4o');
  // apiKeys presence booleans
  assert.equal(result.apiKeys.jules, true);
  assert.equal(result.apiKeys.cursor, false);
  assert.equal(result.apiKeys.codex, false);
  assert.equal(result.apiKeys.openrouter, false);
  assert.equal(result.apiKeys.claude, false);
  assert.equal(result.apiKeys.github, false);
  assert.equal(result.apiKeys.jira, false);
  assert.equal(result.apiKeys.cloudflare, true);
  // cloudflare block
  assert.equal(result.cloudflare.configured, true);
  assert.equal(result.cloudflare.accountId, 'acc1');
  assert.equal(result.cloudflare.namespaceTitle, 'myNs');
  // filters block
  assert.ok(result.filters.providers);
  assert.ok(result.filters.statuses);
  // path arrays must be arrays so .length reads never crash
  assert.equal(typeof result.claudeCloudConfigured, 'boolean');
});

test('web-api setApiKey validates providers and persists', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  const api = createWebApi({ storage });

  assert.deepEqual(await api.setApiKey('nope', 'x'), { success: false, error: 'Unknown provider' });
  assert.deepEqual(await api.setApiKey('jules', 'k1'), { success: true });
  assert.equal(storage.hasApiKey('jules'), true);
  assert.deepEqual(await api.removeApiKey('jules'), { success: true });
  assert.equal(storage.hasApiKey('jules'), false);

  assert.deepEqual(await api.setJiraBaseUrl('https://x.example.com'), { success: true });
  assert.equal((await api.getSettings()).jiraBaseUrl, 'https://x.example.com');
});

test('web-api setPolling, setTheme, setModel, saveFilters persist', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const storage = createStorage(makeStorage());
  const api = createWebApi({ storage });

  assert.deepEqual(await api.setPolling(false, 45000), { success: true });
  let settings = (await api.getSettings()).settings;
  assert.equal(settings.autoPolling, false);
  assert.equal(settings.pollingInterval, 45000);

  assert.deepEqual(await api.setTheme('dark'), { success: true });
  assert.deepEqual(await api.setModel('m1'), { success: true });
  assert.deepEqual(
    await api.saveFilters({ providers: { jules: false }, statuses: { running: false }, search: 'x' }),
    { success: true }
  );
  settings = (await api.getSettings()).settings;
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.selectedModel, 'm1');
  assert.deepEqual((await api.getSettings()).filters.providers.jules, false);
  assert.deepEqual((await api.getSettings()).filters.statuses.running, false);
  assert.deepEqual((await api.getSettings()).filters.search, 'x');
});

test('web-api path handlers degrade gracefully on web', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  assert.deepEqual(await api.addAntigravityPath('/x'), { success: true, paths: [] });
  assert.deepEqual(await api.getAntigravityPaths(), { paths: [] });
  assert.deepEqual(await api.getClaudePaths(), { paths: [] });
  assert.deepEqual(await api.getCursorPaths(), { paths: [] });
  assert.deepEqual(await api.getCodexPaths(), { paths: [] });
  assert.deepEqual(await api.getOpenCodePaths(), { paths: [] });
  assert.deepEqual(await api.getGithubPaths(), { paths: [] });
  const all = await api.getAllProjectPaths();
  assert.ok(all && typeof all === 'object');
});

test('web-api local-only operations report failure without crashing', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  assert.equal(await api.openDirectory(), null);
  assert.equal((await api.updateApp()).success, false);
  assert.equal((await api.openOpenCodeSession('s', '/p')).success, false);
  assert.equal((await api.projects.createLocalRepo({ name: 'x' })).success, false);
  assert.equal((await api.projects.pullRepo('/p')).success, false);
  assert.deepEqual(await api.getConnectionStatus(), {});
  assert.equal(await api.openExternal('https://example.com'), null);
});

// ---------------------------------------------------------------------------
// web-api — agents envelope (mirrors agent-discovery-cache formatPayload)
// ---------------------------------------------------------------------------

test('web-api getAgents returns full empty envelope with counts on first call', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  const result = await api.getAgents({ sinceRevision: 0, force: true });
  assert.equal(result.full, true);
  assert.deepEqual(result.agents, []);
  assert.equal(result.revision > 0, true);
  for (const key of [
    'antigravity',
    'jules',
    'cursor',
    'codex',
    'claude-cli',
    'claude-cloud',
    'opencode',
  ]) {
    assert.equal(result.counts[key], 0, `counts.${key} must be present`);
  }
  assert.equal(result.counts.total, 0);
  assert.deepEqual(result.errors, []);
});

test('web-api getAgents short-circuits unchanged revisions', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  const first = await api.getAgents({ sinceRevision: 0, force: true });
  const second = await api.getAgents({ sinceRevision: first.revision, force: false });
  assert.equal(second.unchanged, true);
  assert.equal(second.revision, first.revision);
});

test('web-api onRefreshTick subscribes and unsubscribes', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  let calls = 0;
  const unsub = api.onRefreshTick(() => {
    calls += 1;
  });
  assert.equal(typeof unsub, 'function');
  await api._emitRefreshTick();
  assert.equal(calls, 1);
  unsub();
  await api._emitRefreshTick();
  assert.equal(calls, 1);
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
