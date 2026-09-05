jest.mock('../../src/main/ipc/provider-registry', () => ({
  AGENT_LIST_KEYS: [
    'antigravity',
    'jules',
    'cursor',
    'codex',
    'claude-cli',
    'claude-cloud',
    'opencode',
  ],
  REPO_LIST_KEYS: [
    'jules',
    'cursor',
    'antigravity',
    'codex',
    'claude-cli',
    'claude-cloud',
    'opencode',
  ],
  fetchAllAgents: jest.fn(),
  getAgentDetails: jest.fn(),
  fetchRepositories: jest.fn(),
  fetchAllRepositories: jest.fn(),
  createTask: jest.fn(),
  sendTaskMessage: jest.fn(),
}));

const mcpServerService = require('../../src/main/services/mcp-server-service');
const providerRegistry = require('../../src/main/ipc/provider-registry');

const TEST_TOKEN = 'test-token-abcdef';

function makeDeps(overrides = {}) {
  return {
    configStore: {
      getMcpConfig: jest.fn(() => ({
        enabled: true,
        host: '127.0.0.1',
        port: 0,
        token: TEST_TOKEN,
      })),
      getOrCreateMcpToken: jest.fn(() => TEST_TOKEN),
      ...overrides.configStore,
    },
    cloudflareKvService: overrides.cloudflareKvService,
    lifecycle: overrides.lifecycle,
  };
}

async function startServer(overrides = {}) {
  const deps = makeDeps(overrides);
  const status = await mcpServerService.start(deps);
  expect(status.running).toBe(true);
  return status;
}

async function rpc(method, params, { token = TEST_TOKEN, port } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return response;
}

async function rpcResult(method, params, port) {
  const response = await rpc(method, params, { port });
  expect(response.status).toBe(200);
  return (await response.json()).result;
}

function textPayload(result) {
  expect(result.content[0].type).toBe('text');
  return JSON.parse(result.content[0].text);
}

describe('mcp-server-service', () => {
  afterEach(async () => {
    await mcpServerService.stop();
    jest.clearAllMocks();
  });

  test('does not start when disabled', async () => {
    const deps = makeDeps({
      configStore: {
        getMcpConfig: () => ({ enabled: false, host: '127.0.0.1', port: 0, token: '' }),
      },
    });
    const status = await mcpServerService.start(deps);
    expect(status.running).toBe(false);
  });

  test('rejects requests without or with a wrong bearer token', async () => {
    const { port } = await startServer();

    const noAuth = await rpc('initialize', {}, { token: null, port });
    expect(noAuth.status).toBe(401);

    const wrongAuth = await rpc('initialize', {}, { token: 'nope', port });
    expect(wrongAuth.status).toBe(401);
  });

  test('rejects GET requests and unknown paths', async () => {
    const { port } = await startServer();

    const getMcp = await fetch(`http://127.0.0.1:${port}/mcp`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(getMcp.status).toBe(405);

    const wrongPath = await fetch(`http://127.0.0.1:${port}/other`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(wrongPath.status).toBe(404);
  });

  test('initialize reports server info and tools capability', async () => {
    const { port } = await startServer();

    const result = await rpcResult('initialize', { protocolVersion: '2025-06-18' }, port);
    expect(result.protocolVersion).toBe('2025-06-18');
    expect(result.serverInfo.name).toBe('rts-agents');
    expect(result.capabilities.tools).toBeDefined();
  });

  test('notifications return 202 with no body', async () => {
    const { port } = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });

  test('tools/list exposes the RTS tools with schemas', async () => {
    const { port } = await startServer();

    const result = await rpcResult('tools/list', {}, port);
    const names = result.tools.map((tool) => tool.name);
    expect(names).toEqual([
      'list_agents',
      'get_agent_details',
      'list_repositories',
      'dispatch_task',
      'send_task_message',
      'list_devices',
    ]);
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  test('list_agents returns agents and applies filters', async () => {
    providerRegistry.fetchAllAgents.mockResolvedValue({
      agents: [
        { id: 'a1', provider: 'codex', status: 'running' },
        { id: 'a2', provider: 'jules', status: 'completed' },
        { id: 'a3', provider: 'codex', status: 'completed' },
      ],
      errors: [],
      counts: { total: 3 },
    });
    const { port } = await startServer();

    const all = textPayload(await rpcResult('tools/call', { name: 'list_agents', arguments: {} }, port));
    expect(all.total).toBe(3);
    expect(all.agents).toHaveLength(3);

    const filtered = textPayload(
      await rpcResult(
        'tools/call',
        { name: 'list_agents', arguments: { provider: 'codex', status: 'completed' } },
        port
      )
    );
    expect(filtered.agents.map((agent) => agent.id)).toEqual(['a3']);
  });

  test('dispatch_task creates a task and reports failures as tool errors', async () => {
    providerRegistry.createTask.mockResolvedValue({
      success: true,
      task: { id: 'task-1', provider: 'codex' },
    });
    const { port } = await startServer();

    const created = textPayload(
      await rpcResult(
        'tools/call',
        {
          name: 'dispatch_task',
          arguments: { provider: 'codex', prompt: 'Ship it', projectPath: '/repo' },
        },
        port
      )
    );
    expect(created.success).toBe(true);
    expect(providerRegistry.createTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'codex',
        options: expect.objectContaining({ prompt: 'Ship it', projectPath: '/repo' }),
      })
    );

    const badProvider = await rpcResult(
      'tools/call',
      { name: 'dispatch_task', arguments: { provider: 'does-not-exist', prompt: 'hi' } },
      port
    );
    expect(badProvider.isError).toBe(true);

    providerRegistry.createTask.mockResolvedValue({
      success: false,
      error: 'Cloudflare KV not configured',
    });
    const failedDispatch = await rpcResult(
      'tools/call',
      {
        name: 'dispatch_task',
        arguments: { provider: 'codex', prompt: 'hi', targetDeviceId: 'dev' },
      },
      port
    );
    expect(failedDispatch.isError).toBe(true);
    expect(textPayload(failedDispatch).error).toBe('Cloudflare KV not configured');
  });

  test('list_devices merges device task statuses from KV', async () => {
    const deps = {
      cloudflareKvService: {
        ensureDevicesArray: jest.fn(async () => [{ id: 'd1', name: 'box' }]),
        getTasksMap: jest.fn(async () => ({ d1: { status: 'running' } })),
      },
      lifecycle: { ensureCloudflareNamespaceId: jest.fn(async () => 'ns1') },
    };
    const { port } = await startServer(deps);

    const payload = textPayload(await rpcResult('tools/call', { name: 'list_devices', arguments: {} }, port));
    expect(payload.configured).toBe(true);
    expect(payload.devices[0]).toEqual({ id: 'd1', name: 'box', taskStatus: { status: 'running' } });
  });

  test('unknown tool and unknown method produce errors', async () => {
    const { port } = await startServer();

    const unknownTool = await rpcResult('tools/call', { name: 'nope', arguments: {} }, port);
    expect(unknownTool.isError).toBe(true);

    const response = await rpc('no/such/method', {}, { port });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error.code).toBe(-32601);
  });

  test('stop releases the server', async () => {
    await startServer();
    expect(mcpServerService.status().running).toBe(true);
    await mcpServerService.stop();
    expect(mcpServerService.status().running).toBe(false);
  });
});
