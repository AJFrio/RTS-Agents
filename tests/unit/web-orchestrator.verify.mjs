/**
 * Web Janus orchestrator contract tests (Node-native, ESM).
 *
 * Covers the tool loop that used to be desktop-only: OpenRouter receives
 * ORCHESTRATOR_TOOLS, native / JSON tool calls execute against hub / GitHub /
 * Cloudflare KV adapters, and local-only tools return a web error.
 *
 * Usage: node tests/unit/web-orchestrator.verify.mjs
 */
import assert from 'node:assert/strict';

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

function makeStorage(initial = {}) {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
    ...initial,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text, status = 200) {
  return new Response(String(text), { status, headers: { 'content-type': 'text/plain' } });
}

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

function chatRoute(replies) {
  const queue = [...replies];
  return {
    match: (url, opts) => url.includes('/chat/completions') && opts.method === 'POST',
    respond: () => {
      const next = queue.shift();
      if (!next) return jsonResponse({ error: 'unexpected extra chat call' }, 500);
      return jsonResponse({ choices: [{ message: next }] });
    },
  };
}

async function makeApi({ keys = {}, cloudflare = null, routes = [] } = {}) {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createWebApi } = await import('../../src/renderer/platform/web-api.mjs');
  const storage = createStorage(makeStorage());
  for (const [provider, key] of Object.entries(keys)) {
    storage.setApiKey(provider, key);
  }
  if (cloudflare) storage.setCloudflareConfig(cloudflare);
  const fetchStub = makeFetch(routes);
  const api = createWebApi({ storage, fetchImpl: fetchStub });
  return { api, fetchStub, storage };
}

function toolNamesFromChat(fetchStub) {
  const chatCall = fetchStub.calls.find((c) => String(c.url).includes('/chat/completions'));
  assert.ok(chatCall, 'expected an OpenRouter chat call');
  const body = JSON.parse(chatCall.opts.body);
  return (body.tools || []).map((tool) => tool.function?.name);
}

test('orchestrator chat sends Janus tools to OpenRouter', async () => {
  const { api, fetchStub } = await makeApi({
    keys: { openrouter: 'or-key' },
    routes: [chatRoute([{ role: 'assistant', content: 'Hello from Janus' }])],
  });

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'hi' }],
    'openrouter/openai/gpt-4o'
  );
  assert.equal(response.role, 'assistant');
  assert.equal(response.content, 'Hello from Janus');
  assert.deepEqual(response.toolCalls, []);

  const names = toolNamesFromChat(fetchStub);
  for (const required of [
    'list_computers',
    'list_tasks',
    'list_pull_requests',
    'list_github_repos',
    'start_task',
    'show_task',
  ]) {
    assert.ok(names.includes(required), `missing tool ${required}`);
  }
});

test('list_tasks native tool call uses the hub snapshot and surfaces cards', async () => {
  const { api, fetchStub } = await makeApi({
    keys: { openrouter: 'or-key', jules: 'j-key' },
    routes: [
      {
        match: urlHas('/api/jules/sessions?pageSize=100'),
        respond: () =>
          jsonResponse({
            sessions: [
              {
                id: 's1',
                title: 'Fix login',
                state: 'IN_PROGRESS',
                prompt: 'fix it',
                sourceContext: {
                  source: 'sources/github/acme/web',
                  githubRepoContext: { startingBranch: 'main' },
                },
                createTime: '2026-01-01T00:00:00.000Z',
                updateTime: '2026-01-02T00:00:00.000Z',
              },
            ],
          }),
      },
      chatRoute([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_tasks',
              type: 'function',
              function: { name: 'list_tasks', arguments: '{"status":"running"}' },
            },
          ],
        },
        { role: 'assistant', content: 'Jules is fixing login.' },
      ]),
    ],
  });

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'summarize running tasks' }],
    'openrouter/openai/gpt-4o'
  );

  assert.equal(response.content, 'Jules is fixing login.');
  assert.equal(response.toolCalls.length, 1);
  assert.equal(response.toolCalls[0].tool, 'list_tasks');
  const listed = JSON.parse(response.toolCalls[0].result);
  assert.equal(listed[0].id, 'jules-s1');
  assert.equal(listed[0].status, 'running');
  assert.equal(response.taskCards[0].id, 'jules-s1');
  assert.equal(response.cards[0].kind, 'task');

  const followUp = fetchStub.calls
    .filter((c) => String(c.url).includes('/chat/completions'))
    .map((c) => JSON.parse(c.opts.body));
  assert.equal(followUp.length, 2);
  const toolMsg = followUp[1].messages.find((msg) => msg.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'call_tasks');
  assert.ok(toolMsg.content.includes('jules-s1'));
});

test('list_pull_requests uses the GitHub worker proxy', async () => {
  const { api } = await makeApi({
    keys: { openrouter: 'or-key', github: 'gh-key' },
    routes: [
      {
        match: urlHas('/api/github/user/repos?sort=updated'),
        respond: () =>
          jsonResponse([{ name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' }]),
      },
      {
        match: urlHas('/api/github/repos/acme/web/pulls?state=open'),
        respond: () =>
          jsonResponse([
            {
              number: 12,
              title: 'Fix composer',
              state: 'open',
              draft: false,
              html_url: 'https://github.com/acme/web/pull/12',
              created_at: '2026-09-01T00:00:00Z',
              user: { login: 'aj' },
              base: {
                ref: 'main',
                repo: { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web' },
              },
              head: { ref: 'fix', sha: 'abc', repo: { name: 'web', owner: { login: 'acme' } } },
            },
          ]),
      },
      chatRoute([
        {
          role: 'assistant',
          content: '{"tool":"list_pull_requests","args":{}}',
        },
        { role: 'assistant', content: 'You have one open PR.' },
      ]),
    ],
  });

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'Do I have any open PRs?' }],
    'openrouter/openai/gpt-4o'
  );

  assert.equal(response.content, 'You have one open PR.');
  assert.equal(response.toolCalls[0].tool, 'list_pull_requests');
  const prs = JSON.parse(response.toolCalls[0].result);
  assert.equal(prs[0].number, 12);
  assert.equal(prs[0].title, 'Fix composer');
  assert.equal(response.cards[0].kind, 'pr');
  assert.equal(response.cards[0].id, 'pr:acme/web#12');
});

test('list_computers reads synced devices from Cloudflare KV', async () => {
  const { api } = await makeApi({
    keys: { openrouter: 'or-key' },
    cloudflare: { accountId: 'acc1', apiToken: 'tok1', namespaceId: 'ns1' },
    routes: [
      {
        match: urlHas('/api/cloudflare/namespaces/ns1/values/devices'),
        respond: () =>
          textResponse(
            JSON.stringify([
              {
                id: 'dev1',
                name: 'Workstation',
                status: 'on',
                lastHeartbeat: '2026-01-01T00:00:00.000Z',
                repos: [{ name: 'RTS-Agents', path: '/repos/RTS-Agents' }],
              },
            ])
          ),
      },
      chatRoute([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'list_computers', arguments: '{}' },
            },
          ],
        },
        { role: 'assistant', content: 'Workstation is online.' },
      ]),
    ],
  });

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'what devices do I have?' }],
    'openrouter/openai/gpt-4o'
  );

  assert.equal(response.content, 'Workstation is online.');
  const listed = JSON.parse(response.toolCalls[0].result);
  assert.equal(listed[0].id, 'dev1');
  assert.deepEqual(listed[0].repos, ['RTS-Agents']);
  assert.equal(response.cards[0].kind, 'device');
});

test('start_task on local uses the cloud createTask path', async () => {
  const { api, fetchStub } = await makeApi({
    keys: { openrouter: 'or-key', jules: 'j-key' },
    routes: [
      {
        match: (url, opts) => url.includes('/api/jules/sessions') && opts.method === 'POST',
        respond: () =>
          jsonResponse({
            id: 's-new',
            title: 'Fix bug',
            state: 'QUEUED',
            prompt: 'Fix the bug',
            sourceContext: { source: 'sources/github/acme/web' },
            createTime: '2026-01-01T00:00:00.000Z',
            updateTime: '2026-01-01T00:00:00.000Z',
          }),
      },
      chatRoute([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c-start',
              type: 'function',
              function: {
                name: 'start_task',
                arguments: JSON.stringify({
                  computer_id: 'local',
                  repo_path: 'sources/github/acme/web',
                  task_description: 'Fix the bug',
                  provider: 'jules',
                }),
              },
            },
          ],
        },
        { role: 'assistant', content: 'Started Jules.' },
      ]),
    ],
  });

  const response = await api.orchestratorChat(
    [{ role: 'user', content: 'start a jules task' }],
    'openrouter/openai/gpt-4o'
  );

  assert.equal(response.content, 'Started Jules.');
  const createCall = fetchStub.calls.find(
    (c) => String(c.url).includes('/api/jules/sessions') && c.opts.method === 'POST'
  );
  assert.ok(createCall, 'expected Jules session create');
  assert.equal(response.toolCalls[0].tool, 'start_task');
  const started = JSON.parse(response.toolCalls[0].result);
  assert.equal(started.success, true);
  assert.equal(started.task.id, 'jules-s-new');
  assert.equal(response.taskCards[0].id, 'jules-s-new');
});

test('local-only tools and missing GitHub return actionable errors', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createAgentOrchestratorService } =
    await import('../../src/renderer/platform/providers/agent-orchestrator-service.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('openrouter', 'or-key');
  const orchestrator = createAgentOrchestratorService({
    openrouter: { chat: async () => ({ choices: [] }), getModels: async () => [] },
    storage,
    github: null,
    cloudflareKv: null,
  });

  const localRepo = await orchestrator.executeTool({
    tool: 'create_local_repo',
    args: { name: 'demo' },
  });
  assert.match(localRepo.error, /not available in the web app/);

  const pull = await orchestrator.executeTool({ tool: 'pull_repo', args: { path: '/tmp/x' } });
  assert.match(pull.error, /not available in the web app/);

  const prs = await orchestrator.executeTool({ tool: 'list_pull_requests', args: {} });
  assert.match(prs.error, /GitHub/);

  const computers = await orchestrator.executeTool({ tool: 'list_computers', args: {} });
  assert.deepEqual(computers.computers, []);
  assert.match(computers.note, /Cloudflare KV/);
});

test('peeked dashboard snapshot is injected so running-task questions skip list_tasks', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createAgentOrchestratorService } =
    await import('../../src/renderer/platform/providers/agent-orchestrator-service.mjs');
  const storage = createStorage(makeStorage());
  storage.setApiKey('openrouter', 'or-key');
  const chats = [];
  const orchestrator = createAgentOrchestratorService({
    openrouter: {
      async chat(messages) {
        chats.push(messages);
        return { choices: [{ message: { role: 'assistant', content: 'Jules is fixing login.' } }] };
      },
      getModels: async () => [],
    },
    storage,
  });
  const listTasks = async () => [];
  orchestrator.setListTasksCallback(listTasks, {
    peek: () => [
      {
        id: 'jules-1',
        provider: 'jules',
        status: 'running',
        name: 'Fix login',
        repository: '/repo/a',
      },
    ],
  });

  const result = await orchestrator.chat(
    [{ role: 'user', content: 'what tasks are running?' }],
    'openrouter/openai/gpt-4o'
  );

  assert.equal(result.content, 'Jules is fixing login.');
  assert.equal(chats.length, 1);
  assert.match(chats[0][0].content, /jules-1/);
  assert.match(chats[0][0].content, /Fix login/);
});

test('hub.peekAgents is null before the first refresh and returns the cache after', async () => {
  const { createAgentHub } = await import('../../src/renderer/platform/web-agent-hub.mjs');
  const hub = createAgentHub({
    storage: {
      hasApiKey: () => false,
      getSettings: () => ({ autoPolling: false, pollingInterval: 30000 }),
    },
    providers: {},
  });
  assert.equal(hub.peekAgents(), null);
  await hub.getAgents({ force: true });
  assert.deepEqual(hub.peekAgents(), []);
});

test('start_task for a CLI provider on local is rejected', async () => {
  const { createStorage } = await import('../../src/renderer/platform/web-storage.mjs');
  const { createAgentOrchestratorService } =
    await import('../../src/renderer/platform/providers/agent-orchestrator-service.mjs');
  const storage = createStorage(makeStorage());
  const orchestrator = createAgentOrchestratorService({
    openrouter: { chat: async () => ({ choices: [] }), getModels: async () => [] },
    storage,
  });
  orchestrator.setCreateTaskCallback(async () => {
    throw new Error('should not dispatch');
  });
  const result = await orchestrator.executeTool({
    tool: 'start_task',
    args: {
      computer_id: 'local',
      repo_path: '/repo',
      task_description: 'do it',
      provider: 'claude-cli',
    },
  });
  assert.match(result.error, /synced desktop/);
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
