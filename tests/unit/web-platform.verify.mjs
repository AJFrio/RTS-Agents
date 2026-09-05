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
  assert.equal(result.cursorCliInstalled, false);
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

test('web-api onSessionUpdated is a no-op unsubscribe', async () => {
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const api = createWebApi({ storage: makeStorage() });
  const unsub = api.onSessionUpdated(() => {});
  assert.equal(typeof unsub, 'function');
  unsub();
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
// Helpers for provider fetcher contract tests (injected fetch/storage/timers)
// ---------------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text, status = 200) {
  return new Response(String(text), { status, headers: { 'content-type': 'text/plain' } });
}

/**
 * Injected fetch: routes by URL fragment; every call is recorded so tests can
 * assert what the provider actually asked for (path, method, headers, body).
 */
function makeFetch(routes) {
  const calls = [];
  async function fn(url, opts = {}) {
    calls.push({ url, opts });
    for (const route of routes) {
      if (route.match(url, opts)) return route.respond(url, opts);
    }
    return jsonResponse({ error: `Unmatched request: ${url}` }, 404);
  }
  fn.calls = calls;
  return fn;
}

const urlHas = (fragment) => (url) => url.includes(fragment);

/** Injected timer source — records intervals instead of scheduling real ones. */
function makeTimers() {
  const timers = {
    intervals: [],
    cleared: [],
    setInterval(fn, ms) {
      const entry = { fn, ms };
      timers.intervals.push(entry);
      return entry;
    },
    clearInterval(entry) {
      timers.cleared.push(entry);
      const idx = timers.intervals.indexOf(entry);
      if (idx >= 0) timers.intervals.splice(idx, 1);
    },
  };
  return timers;
}

// ---------------------------------------------------------------------------
// web-api — provider fetchers (desktop Agent shape + counts envelope)
// ---------------------------------------------------------------------------

test('web-api jules fetcher maps sessions to the desktop Agent shape with counts', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions?pageSize=100'),
      respond: () =>
        jsonResponse({
          sessions: [
            {
              id: 's1',
              title: 'Running task',
              state: 'IN_PROGRESS',
              prompt: 'fix the login bug',
              sourceContext: {
                source: 'sources/github/acme/web',
                githubRepoContext: { startingBranch: 'fix-login' },
              },
              createTime: '2026-01-01T00:00:00.000Z',
              updateTime: '2026-01-02T00:00:00.000Z',
            },
            {
              id: 's2',
              title: 'Done task',
              state: 'COMPLETED',
              prompt: 'ship it',
              createTime: '2026-01-03T00:00:00.000Z',
              updateTime: '2026-01-04T00:00:00.000Z',
              outputs: [
                {
                  pullRequest: { url: 'https://github.com/acme/web/pull/5', description: 'ships it' },
                },
              ],
            },
          ],
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.getAgents({ sinceRevision: 0, force: true });

  assert.equal(result.full, true);
  assert.equal(result.counts.jules, 2);
  assert.equal(result.counts.total, 2);
  assert.deepEqual(result.errors, []);

  const running = result.agents.find((a) => a.rawId === 's1');
  assert.equal(running.id, 'jules-s1');
  assert.equal(running.provider, 'jules');
  assert.equal(running.name, 'Running task');
  assert.equal(running.status, 'running');
  assert.equal(running.prompt, 'fix the login bug');
  assert.equal(running.repository, 'https://github.com/acme/web');
  assert.equal(running.branch, 'fix-login');
  assert.equal(running.prUrl, null);
  assert.equal(running.rawId, 's1');
  assert.equal(running.webUrl, 'https://jules.google.com/session/s1');
  assert.equal(running.source, 'sources/github/acme/web');
  assert.ok(running.createdAt instanceof Date, 'createdAt is a Date');
  assert.ok(running.updatedAt instanceof Date, 'updatedAt is a Date');

  const done = result.agents.find((a) => a.rawId === 's2');
  assert.equal(done.status, 'completed'); // outputs present → completed
  assert.equal(done.prUrl, 'https://github.com/acme/web/pull/5');
  assert.equal(done.summary, 'ships it');
  assert.equal(done.repository, null);

  // Auth header must carry the stored key (worker upgrades it server-side).
  assert.equal(fetchStub.calls[0].opts.headers['X-API-Key'], 'j-key');
});

test('web-api cursor fetcher maps agents + latest run to the desktop Agent shape', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('cursor', 'c-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/cursor/agents?limit=100'),
      respond: () =>
        jsonResponse({
          agents: [
            {
              id: 'ag1',
              name: 'Agent One',
              status: 'ACTIVE',
              latestRunId: 'run9',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
              repos: [{ url: 'https://github.com/acme/web' }],
            },
          ],
        }),
    },
    {
      match: urlHas('/api/cursor/agents/ag1/runs/run9'),
      respond: () =>
        jsonResponse({
          run: {
            id: 'run9',
            status: 'FINISHED',
            result: 'all checks pass',
            updatedAt: '2026-01-03T00:00:00.000Z',
            git: {
              branches: [
                {
                  repoUrl: 'https://github.com/acme/web',
                  branch: 'feature/x',
                  prUrl: 'https://github.com/acme/web/pull/3',
                },
              ],
            },
          },
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.getAgents({ sinceRevision: 0, force: true });

  assert.equal(result.counts.cursor, 1);
  assert.equal(result.counts.total, 1);
  assert.deepEqual(result.errors, []);

  const agent = result.agents[0];
  assert.equal(agent.id, 'cursor-ag1');
  assert.equal(agent.provider, 'cursor');
  assert.equal(agent.name, 'Agent One');
  assert.equal(agent.status, 'completed'); // run status FINISHED wins over agent ACTIVE
  assert.equal(agent.repository, 'https://github.com/acme/web');
  assert.equal(agent.branch, 'feature/x');
  assert.equal(agent.prUrl, 'https://github.com/acme/web/pull/3');
  assert.equal(agent.summary, 'all checks pass');
  assert.equal(agent.rawId, 'ag1');
  assert.equal(agent.webUrl, 'https://cursor.com/agents/ag1');
});

test('web-api does not fetch Codex cloud threads', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('codex', 'openai-key');
  const fetchStub = makeFetch([]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.getAgents({ sinceRevision: 0, force: true });

  assert.equal(result.counts.codex, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(fetchStub.calls.length, 0);
});

test('web-api claude fetcher maps tracked conversations without network calls', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('claude', 'anthropic-key');
  const kv = makeStorage();
  kv.setItem(
    'claude_tracked_conversations',
    JSON.stringify([
      {
        id: 'c1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        prompt: 'hello',
        repository: null,
        title: 'Conv',
        messages: [{ role: 'user', content: 'hello' }],
        lastResponse: { id: 'resp1', content: [{ type: 'text', text: 'hi there' }] },
        status: 'completed',
      },
    ])
  );
  const fetchStub = makeFetch([]); // getAllAgents is local-only — no network
  const api = createWebApi({ storage, fetchImpl: fetchStub, kv });

  const result = await api.getAgents({ sinceRevision: 0, force: true });

  assert.equal(result.counts['claude-cloud'], 1);
  assert.equal(result.counts.total, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(fetchStub.calls.length, 0, 'claude listing must not hit the network');

  const agent = result.agents[0];
  assert.equal(agent.id, 'claude-cloud-c1');
  assert.equal(agent.provider, 'claude-cloud');
  assert.equal(agent.name, 'Conv');
  assert.equal(agent.status, 'completed');
  assert.equal(agent.prompt, 'hello');
  assert.equal(agent.rawId, 'c1');
  assert.equal(agent.summary, 'hi there');
});

test('web-api getAgents serves cached revision without refetching, force refetches', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions?pageSize=100'),
      respond: () => jsonResponse({ sessions: [{ id: 's1', prompt: 'p', createTime: '2026-01-01T00:00:00.000Z' }] }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });
  const countRefetches = () => fetchStub.calls.filter((c) => c.url.includes('/sessions?')).length;

  const first = await api.getAgents({ sinceRevision: 0, force: true });
  assert.equal(countRefetches(), 1);

  // Same revision → unchanged envelope, no additional provider fetch.
  const second = await api.getAgents({ sinceRevision: first.revision, force: false });
  assert.equal(second.unchanged, true);
  assert.equal(second.revision, first.revision);
  assert.equal(countRefetches(), 1);

  // New sinceRevision (caller behind) → full refresh fetch.
  const third = await api.getAgents({ sinceRevision: 0, force: false });
  assert.equal(third.full, true);
  assert.equal(third.revision > first.revision, true);
  assert.equal(countRefetches(), 2);

  // Explicit force bypasses the revision short-circuit too.
  await api.getAgents({ sinceRevision: third.revision, force: true });
  assert.equal(countRefetches(), 3);
});

test('web-api one failing provider does not break the others', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'bad-key');
  storage.setApiKey('cursor', 'good-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions'),
      respond: () => jsonResponse({ error: 'nope' }, 401),
    },
    {
      match: urlHas('/api/cursor/agents?limit=100'),
      respond: () => jsonResponse({ agents: [{ id: 'ag1', name: 'Ok' }] }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.getAgents({ sinceRevision: 0, force: true });

  assert.equal(result.agents.length, 1, 'cursor agents survive the jules failure');
  assert.equal(result.agents[0].provider, 'cursor');
  assert.equal(result.counts.cursor, 1);
  assert.equal(result.counts.jules, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].provider, 'jules');
  assert.ok(result.errors[0].error.includes('401'), 'error carries the HTTP status');
});

// ---------------------------------------------------------------------------
// web-api — polling lifecycle (injected timers)
// ---------------------------------------------------------------------------

test('web-api polling auto-starts at boot, ticks refresh the cache, setPolling restarts/clears', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions?pageSize=100'),
      respond: () => jsonResponse({ sessions: [{ id: 's1', prompt: 'p', createTime: '2026-01-01T00:00:00.000Z' }] }),
    },
  ]);
  const timers = makeTimers();
  const api = createWebApi({ storage, fetchImpl: fetchStub, timers });

  // Boot: autoPolling defaults to true → one interval at the stored interval.
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0].ms, 30000);

  let ticks = 0;
  const unsub = api.onRefreshTick(() => {
    ticks += 1;
  });
  assert.equal(ticks, 0, 'no immediate tick at boot');

  // Firing the poll interval refreshes the provider cache and emits a tick.
  await timers.intervals[0].fn();
  assert.equal(ticks, 1);
  const agents = (await api.getAgents({ sinceRevision: 0 })).agents;
  assert.equal(agents.length, 1, 'poller refreshed the provider cache');

  // setPolling(false, interval) persists and clears the timer.
  await api.setPolling(false, 45000);
  assert.equal(timers.cleared.length, 1);
  assert.equal(timers.intervals.length, 0);
  assert.equal((await api.getSettings()).settings.autoPolling, false);
  assert.equal((await api.getSettings()).settings.pollingInterval, 45000);

  // setPolling(true, interval) restarts with the new interval.
  await api.setPolling(true, 5000);
  assert.equal(timers.intervals.length, 1);
  assert.equal(timers.intervals[0].ms, 5000);

  unsub();
});

// ---------------------------------------------------------------------------
// web-api — task creation / dispatch
// ---------------------------------------------------------------------------

test('web-api createTask jules provider path returns the task envelope', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: (url, opts) => urlHas('/api/jules/sessions')(url) && opts.method === 'POST',
      respond: () =>
        jsonResponse({
          id: 's9',
          title: 'New task',
          state: 'QUEUED',
          prompt: 'make it',
          sourceContext: { source: 'sources/github/acme/web', githubRepoContext: { startingBranch: 'main' } },
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.createTask('jules', {
    prompt: 'make it',
    repository: 'sources/github/acme/web',
  });

  assert.equal(result.success, true);
  assert.equal(result.task.id, 'jules-s9');
  assert.equal(result.task.provider, 'jules');
  assert.equal(result.task.status, 'pending'); // QUEUED → pending
  assert.equal(result.task.rawId, 's9');
  assert.equal(result.task.prompt, 'make it');
  assert.equal(result.task.source, 'sources/github/acme/web');

  const sent = JSON.parse(fetchStub.calls[0].opts.body);
  assert.equal(sent.sourceContext.source, 'sources/github/acme/web');
  assert.equal(sent.automationMode, 'AUTO_CREATE_PR');
});

test('web-api createTask dispatches remotely via KV queue when targetDeviceId is set', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setCloudflareConfig({ accountId: 'acc1', apiToken: 'tok1', namespaceId: 'ns1' });
  const fetchStub = makeFetch([
    {
      match: (url, opts) =>
        url.includes('/api/cloudflare/namespaces/ns1/values/queue%3Adevice1') && opts.method === 'PUT',
      respond: () => textResponse('200 OK'),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const result = await api.createTask('jules', {
    prompt: 'do remote thing',
    repository: '/srv/repo',
    targetDeviceId: 'device1',
  });

  assert.equal(result.success, true);
  assert.equal(result.task.status, 'queued');
  assert.equal(result.task.provider, 'jules');
  assert.equal(result.task.name, 'Remote jules task');
  assert.equal(result.task.summary, 'Queued on remote device');

  const put = fetchStub.calls.find((c) => c.url.includes('queue%3Adevice1') && c.opts.method === 'PUT');
  assert.ok(put, 'queue:<deviceId> value must be written');
  assert.equal(put.opts.headers['Content-Type'], 'text/plain');

  const queue = JSON.parse(put.opts.body);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].tool, 'jules');
  assert.equal(queue[0].repo, '/srv/repo');
  assert.equal(queue[0].prompt, 'do remote thing');
  assert.equal(queue[0].requestedBy, 'web-pwa');
  assert.ok(queue[0].id.startsWith('task-'), 'QueuedTask carries an id');
  assert.ok(queue[0].createdAt, 'QueuedTask carries a createdAt timestamp');
});

test('web-api sendMessage uses the provider followup path', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions/s1:sendMessage'),
      respond: () => jsonResponse({}),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  assert.deepEqual(await api.sendMessage('jules', 's1', 'please continue'), { success: true });
  const sent = JSON.parse(fetchStub.calls[0].opts.body);
  assert.equal(sent.prompt, 'please continue');

  // Unconfigured provider fails with the {success:false, error} envelope.
  const bad = await api.sendMessage('cursor', 'x', 'hi');
  assert.equal(bad.success, false);
  assert.ok(bad.error);
});

// ---------------------------------------------------------------------------
// web-agent-hub — getAgentDetails spread-merge
// ---------------------------------------------------------------------------

test('web-api getAgentDetails merges provider details over the cached base agent', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sessions?pageSize=100'),
      respond: () =>
        jsonResponse({
          sessions: [
            {
              id: 's1',
              title: 'Fix login',
              state: 'IN_PROGRESS',
              prompt: 'base prompt',
              sourceContext: { source: 'sources/github/acme/web', githubRepoContext: { startingBranch: 'fx' } },
              createTime: '2026-01-01T00:00:00.000Z',
              updateTime: '2026-01-02T00:00:00.000Z',
            },
          ],
        }),
    },
    {
      match: (url) => url === '/api/jules/sessions/s1',
      respond: () =>
        jsonResponse({
          id: 's1',
          title: 'Fix login',
          state: 'IN_PROGRESS',
          prompt: 'base prompt',
          sourceContext: { source: 'sources/github/acme/web', githubRepoContext: { startingBranch: 'fx' } },
          createTime: '2026-01-01T00:00:00.000Z',
          updateTime: '2026-01-02T00:00:00.000Z',
        }),
    },
    {
      match: urlHas('/api/jules/sessions/s1/activities?pageSize=100'),
      respond: () =>
        jsonResponse({
          activities: [{ id: 'a1', createTime: '2026-01-03T00:00:00.000Z', agentMessaged: { agentMessage: 'working on it' } }],
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });
  await api.getAgents({ sinceRevision: 0, force: true }); // populate the base cache

  const details = await api.getAgentDetails('jules', 's1');

  assert.equal(details.rawId, 's1');
  assert.equal(details.provider, 'jules');
  assert.equal(details.id, 'jules-s1');
  assert.equal(details.name, 'Fix login');
  assert.ok(Array.isArray(details.activities), 'details include the activities list');
  assert.equal(details.activities[0].type, 'agent_messaged');
  assert.equal(details.activities[0].message, 'working on it');
  assert.ok(details.webUrl, 'base agent webUrl survives the merge');
});

// ---------------------------------------------------------------------------
// GitHub / Jira envelopes via the worker proxy
// ---------------------------------------------------------------------------

test('web-api github getRepos and getAllPrs return desktop envelopes', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('github', 'gh-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/github/user/repos?sort=updated'),
      respond: () =>
        jsonResponse([
          { id: 1, name: 'repoA', owner: { login: 'acme' }, full_name: 'acme/repoA' },
          { id: 2, name: 'repoB', owner: { login: 'acme' }, full_name: 'acme/repoB' },
        ]),
    },
    {
      match: urlHas('/api/github/repos/acme/repoA/pulls?state=open'),
      respond: () =>
        jsonResponse([
          { id: 11, number: 10, title: 'PR A', created_at: '2026-01-02T00:00:00.000Z' },
          { id: 12, number: 9, title: 'PR A2', created_at: '2026-01-03T00:00:00.000Z' },
        ]),
    },
    {
      match: urlHas('/api/github/repos/acme/repoB/pulls?state=open'),
      respond: () =>
        jsonResponse([{ id: 21, number: 20, title: 'PR B', created_at: '2026-01-01T00:00:00.000Z' }]),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const repos = await api.github.getRepos();
  assert.equal(repos.success, true);
  assert.equal(repos.repos.length, 2);
  assert.equal(repos.repos[0].full_name, 'acme/repoA');
  assert.equal(fetchStub.calls[0].opts.headers['X-API-Key'], 'gh-key');

  const prs = await api.github.getAllPrs();
  assert.equal(prs.success, true);
  assert.equal(prs.prs.length, 3);
  // Sorted by created_at descending (newest first).
  assert.deepEqual(
    prs.prs.map((pr) => pr.number),
    [9, 10, 20]
  );
});

test('web-api github error paths report {success:false, error} with empty shapes', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('github', 'bad-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/user/repos?sort=updated'),
      respond: () => jsonResponse({ error: 'Bad credentials' }, 401),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const repos = await api.github.getRepos();
  assert.equal(repos.success, false);
  assert.ok(repos.error.includes('401'));

  const owners = await api.github.getOwners();
  assert.equal(owners.success, false);
  assert.equal(owners.user, null);
  assert.deepEqual(owners.orgs, []);
});

test('web-api jira envelopes send X-JIRA-BASE-URL alongside the API key', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jira', 'jira-token');
  storage.setSettings({ jiraBaseUrl: 'https://jira.example.com/' });
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jira/rest/agile/1.0/board?maxResults=50'),
      respond: () => jsonResponse({ values: [{ id: 1, name: 'Board A', type: 'kanban' }] }),
    },
    {
      match: urlHas('/api/jira/rest/api/3/issue/K-1/comment'),
      respond: () =>
        jsonResponse({ comments: [{ id: 100, body: 'looking at it', created: '2026-01-01T00:00:00.000Z' }] }),
    },
    {
      match: urlHas('/api/jira/rest/agile/1.0/board/1/sprint'),
      respond: () =>
        jsonResponse({
          values: [{ id: 5, name: 'Sprint 5', state: 'active', startDate: '2026-01-01', endDate: '2026-01-07' }],
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const boards = await api.jira.getBoards();
  assert.equal(boards.success, true);
  assert.equal(boards.boards[0].id, 1);
  assert.equal(boards.boards[0].name, 'Board A');

  const comments = await api.jira.getIssueComments('K-1');
  assert.equal(comments.success, true);
  assert.equal(comments.comments.length, 1);
  assert.equal(comments.comments[0].body, 'looking at it');

  const sprints = await api.jira.getSprints(1);
  assert.equal(sprints.success, true);
  assert.equal(sprints.sprints[0].id, 5);
  assert.equal(sprints.sprints[0].state, 'active');

  for (const call of fetchStub.calls) {
    assert.equal(call.opts.headers['X-JIRA-BASE-URL'], 'https://jira.example.com');
    assert.equal(call.opts.headers['X-API-Key'], 'jira-token');
  }
});

// ---------------------------------------------------------------------------
// web-api — testApiKey routing
// ---------------------------------------------------------------------------

test('web-api testApiKey routes to the real provider test endpoints', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  storage.setApiKey('cursor', 'c-key');
  storage.setApiKey('claude', 'a-key');
  storage.setApiKey('github', 'g-key');
  storage.setApiKey('jira', 'j-token');
  storage.setApiKey('openrouter', 'or-key');
  storage.setSettings({ jiraBaseUrl: 'https://jira.example.com' });
  const fetchStub = makeFetch([
    { match: urlHas('/api/jules/sources?pageSize=1'), respond: () => jsonResponse({ sources: [] }) },
    { match: urlHas('/api/cursor/me'), respond: () => jsonResponse({}) },
    {
      match: (url, opts) => urlHas('/api/claude/messages')(url) && opts.method === 'POST',
      respond: () => jsonResponse({ id: 'm1', content: [{ type: 'text', text: 'ok' }] }),
    },
    { match: urlHas('/api/github/user'), respond: () => jsonResponse({ login: 'alice' }) },
    { match: urlHas('/api/jira/rest/api/3/myself'), respond: () => jsonResponse({}) },
    { match: urlHas('https://openrouter.ai/api/v1/models'), respond: () => jsonResponse({ data: [] }) },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  assert.equal((await api.testApiKey('jules')).success, true);
  assert.equal((await api.testApiKey('cursor')).success, true);
  assert.equal((await api.testApiKey('codex')).success, false);
  assert.equal((await api.testApiKey('claude')).success, true);
  assert.equal((await api.testApiKey('github')).success, true);
  assert.equal((await api.testApiKey('jira')).success, true);
  assert.equal((await api.testApiKey('openrouter')).success, true);

  assert.ok(fetchStub.calls.some((c) => c.url.includes('/api/jules/sources?pageSize=1')));
  assert.ok(fetchStub.calls.some((c) => c.url.includes('/api/cursor/me')));
  assert.ok(fetchStub.calls.some((c) => c.url.includes('/api/claude/messages')));
  assert.ok(fetchStub.calls.some((c) => c.url.includes('/api/github/user')));
  const jiraCall = fetchStub.calls.find((c) => c.url.includes('/api/jira/rest/api/3/myself'));
  assert.equal(jiraCall.opts.headers['X-JIRA-BASE-URL'], 'https://jira.example.com');
  const orCall = fetchStub.calls.find((c) => c.url.includes('openrouter.ai'));
  assert.ok(orCall.url.startsWith('https://openrouter.ai/api/v1/models'), 'openrouter calls the API directly');
  assert.equal(orCall.opts.headers['Authorization'], 'Bearer or-key');

  // Failure path surfaces {success:false, error}.
  const bad = makeFetch([{ match: urlHas('/api/jules/sources'), respond: () => jsonResponse({ error: 'denied' }, 403) }]);
  const badApi = createWebApi({
    storage,
    fetchImpl: bad,
  });
  const failed = await badApi.testApiKey('jules');
  assert.equal(failed.success, false);
  assert.ok(failed.error.includes('403'));

  assert.deepEqual(await badApi.testApiKey('nope'), { success: false, error: 'Unknown provider: nope' });
});

// ---------------------------------------------------------------------------
// web-api — Cloudflare KV sync surface
// ---------------------------------------------------------------------------

test('web-api listComputers and getQueueActivity match the desktop shapes', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setCloudflareConfig({ accountId: 'acc1', apiToken: 'tok1', namespaceId: 'ns1' });
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/cloudflare/namespaces/ns1/values/devices'),
      respond: () =>
        textResponse(
          JSON.stringify([
            { id: 'dev1', name: 'Workstation', status: 'on', lastHeartbeat: '2026-01-01T00:00:00.000Z' },
          ])
        ),
    },
    { match: urlHas('/values/tasks'), respond: () => textResponse(JSON.stringify({ dev1: { status: 'running', tool: 'jules' } })) },
    {
      match: urlHas('/values/queue%3Adev1'),
      respond: () => textResponse(JSON.stringify([{ id: 'queued-1' }, { id: 'queued-2' }])),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const computers = await api.listComputers();
  assert.equal(computers.success, true);
  assert.equal(computers.configured, true);
  assert.equal(computers.computers[0].id, 'dev1');
  assert.equal(computers.computers[0].name, 'Workstation');

  const activity = await api.getQueueActivity();
  assert.equal(activity.success, true);
  assert.equal(activity.configured, true);
  assert.equal(activity.devices.length, 1);
  assert.equal(activity.devices[0].deviceId, 'dev1');
  assert.equal(activity.devices[0].name, 'Workstation');
  assert.equal(activity.devices[0].queueLength, 2);
  assert.equal(activity.devices[0].lastTask.status, 'running');
  assert.equal(activity.devices[0].lastTask.tool, 'jules');
  assert.ok(activity.updatedAt, 'updatedAt timestamp is present');

  // Unconfigured → configured:false, empty shapes.
  const bare = createWebApi({ storage: makeStorage() });
  assert.deepEqual(await bare.listComputers(), { success: true, configured: false, computers: [] });
  assert.deepEqual(await bare.getQueueActivity(), { success: true, configured: false, devices: [] });
});

test('web-api pushKeysToCloudflare / pullKeysFromCloudflare sync the keys KV value', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const rawImpl = makeStorage();
  const storage = createStorage(rawImpl);
  storage.setCloudflareConfig({ accountId: 'acc1', apiToken: 'tok1', namespaceId: 'ns1' });
  storage.setApiKey('jules', 'j-secret');
  storage.setApiKey('github', 'g-secret');

  let storedKeys = null;
  const fetchStub = makeFetch([
    {
      match: (url, opts) => urlHas('/values/keys')(url) && opts.method === 'PUT',
      respond: (url, opts) => {
        storedKeys = JSON.parse(opts.body);
        return textResponse('200 OK');
      },
    },
    {
      match: (url, opts) => urlHas('/values/keys')(url) && opts.method === 'GET',
      respond: () =>
        textResponse(JSON.stringify({ jules: 'remote-j', cursor: 'remote-c' })),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const pushed = await api.pushKeysToCloudflare();
  assert.equal(pushed.success, true);
  // Only synced providers with keys are pushed.
  assert.deepEqual(storedKeys, { jules: 'j-secret', github: 'g-secret' });

  const pulled = await api.pullKeysFromCloudflare();
  assert.equal(pulled.success, true);
  assert.deepEqual(pulled.keys, { jules: 'remote-j', cursor: 'remote-c' });
  assert.equal(storage.getApiKey('jules'), 'remote-j');
  assert.equal(storage.getApiKey('cursor'), 'remote-c');
  assert.equal(storage.getApiKey('github'), 'g-secret', 'non-overridden keys survive');

  // Unconfigured → clear failure envelope.
  const bare = createWebApi({ storage: makeStorage() });
  assert.deepEqual(await bare.pushKeysToCloudflare(), {
    success: false,
    error: 'Cloudflare not configured',
  });
});

// ---------------------------------------------------------------------------
// web-api — repositories + orchestrator
// ---------------------------------------------------------------------------

test('web-api getRepositories returns jules sources for jules and empty for cloud/local providers', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('jules', 'j-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('/api/jules/sources?pageSize=50'),
      respond: () =>
        jsonResponse({
          sources: [
            {
              name: 'sources/github/acme/web',
              id: 'web',
              githubRepo: { owner: 'acme', repo: 'web' },
            },
          ],
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const jules = await api.getRepositories('jules');
  assert.equal(jules.success, true);
  assert.equal(jules.repositories.length, 1);
  assert.equal(jules.repositories[0].displayName, 'acme/web');

  assert.deepEqual(await api.getRepositories('claude-cli'), { success: true, repositories: [] });
  assert.deepEqual(await api.getRepositories('opencode'), { success: true, repositories: [] });
});

test('web-api orchestrator models + chat go through OpenRouter', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('openrouter', 'or-key');
  const fetchStub = makeFetch([
    {
      match: urlHas('https://openrouter.ai/api/v1/models'),
      respond: () => jsonResponse({ data: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }] }),
    },
    {
      match: (url, opts) => urlHas('/chat/completions')(url) && opts.method === 'POST',
      respond: () =>
        jsonResponse({
          choices: [{ message: { role: 'assistant', content: 'I can help with that' } }],
        }),
    },
  ]);
  const api = createWebApi({ storage, fetchImpl: fetchStub });

  const models = await api.orchestratorGetModels();
  assert.equal(models.models[0].id, 'openrouter/openai/gpt-4o');
  assert.deepEqual(models.errors, []);

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'hello' }],
    'openrouter/openai/gpt-4o'
  );
  assert.equal(response.role, 'assistant');
  assert.equal(response.content, 'I can help with that');

  // OpenRouter prefix is stripped for the wire request.
  const chatCall = fetchStub.calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.equal(JSON.parse(chatCall.opts.body).model, 'openai/gpt-4o');
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
