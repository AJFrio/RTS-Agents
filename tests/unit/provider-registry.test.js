jest.mock('../../src/main/services/project-service', () => ({
  resolveLocalProjectPath: jest.fn(async (raw) => raw),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(() => null),
}));

jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  enqueueDeviceTask: jest.fn(),
}));

const { createTask, sendTaskMessage, sortAgentsByDate, REMOTE_TASK_PROVIDERS } = require(
  '../../src/main/ipc/provider-registry'
);
const cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');

describe('provider-registry', () => {
  test('sortAgentsByDate orders newest first', () => {
    const sorted = sortAgentsByDate([
      { id: 'a', createdAt: '2020-01-01' },
      { id: 'b', updatedAt: '2025-01-01' },
      { id: 'c', createdAt: '2024-06-01' }
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['b', 'c', 'a']);
  });

  test('REMOTE_TASK_PROVIDERS includes expected local CLIs', () => {
    expect(REMOTE_TASK_PROVIDERS.has('antigravity')).toBe(true);
    expect(REMOTE_TASK_PROVIDERS.has('claude-cli')).toBe(true);
    expect(REMOTE_TASK_PROVIDERS.has('jules')).toBe(false);
  });
});

describe('provider-registry createTask remote payload', () => {
  test('includes the requested model in the queued remote task', async () => {
    cloudflareKvService.enqueueDeviceTask.mockClear();
    cloudflareKvService.enqueueDeviceTask.mockResolvedValue(undefined);
    const deps = {
      configStore: {
        getAllProjectPaths: () => [],
        getOrCreateDeviceIdentity: () => ({ id: 'd1', name: 'dev' }),
      },
      cloudflareKvService,
      lifecycle: { ensureCloudflareNamespaceId: async () => 'ns1' },
    };

    const result = await createTask(deps, {
      provider: 'opencode',
      options: {
        prompt: 'Ship it',
        projectPath: '/repo',
        targetDeviceId: 'device-2',
        model: 'google/gemini-3-pro',
      },
    });

    expect(result.success).toBe(true);
    const [namespaceId, deviceId, task] = cloudflareKvService.enqueueDeviceTask.mock.calls[0];
    expect(namespaceId).toBe('ns1');
    expect(deviceId).toBe('device-2');
    expect(task.model).toBe('google/gemini-3-pro');
  });

  test('omits the model field when none is requested', async () => {
    cloudflareKvService.enqueueDeviceTask.mockClear();
    cloudflareKvService.enqueueDeviceTask.mockResolvedValue(undefined);
    const deps = {
      configStore: {
        getAllProjectPaths: () => [],
        getOrCreateDeviceIdentity: () => ({ id: 'd1', name: 'dev' }),
      },
      cloudflareKvService,
      lifecycle: { ensureCloudflareNamespaceId: async () => 'ns1' },
    };

    await createTask(deps, {
      provider: 'opencode',
      options: { prompt: 'Ship it', projectPath: '/repo', targetDeviceId: 'device-2' },
    });

    const task = cloudflareKvService.enqueueDeviceTask.mock.calls[0][2];
    expect(task.model).toBeNull();
  });
});

describe('provider-registry sendTaskMessage', () => {
  test('routes local ACP providers to the matching follow-up method', async () => {
    const deps = {
      configStore: { hasApiKey: jest.fn(() => true) },
      julesService: { sendMessage: jest.fn() },
      cursorService: { sendCliFollowUp: jest.fn(), addFollowUp: jest.fn() },
      claudeService: { sendLocalFollowUp: jest.fn(), sendFollowUp: jest.fn() },
      codexService: { sendFollowUp: jest.fn() },
      opencodeService: { sendFollowUp: jest.fn() },
      antigravityService: { sendFollowUp: jest.fn() },
    };

    await sendTaskMessage(deps, { provider: 'claude-cli', rawId: 'claude-cli-1', message: 'hi' });
    expect(deps.claudeService.sendLocalFollowUp).toHaveBeenCalledWith('claude-cli-1', 'hi');

    await sendTaskMessage(deps, { provider: 'codex', rawId: 'codex-cli-1', message: 'hi' });
    expect(deps.codexService.sendFollowUp).toHaveBeenCalledWith('codex-cli-1', 'hi');

    await sendTaskMessage(deps, { provider: 'opencode', rawId: 'opencode-1', message: 'hi' });
    expect(deps.opencodeService.sendFollowUp).toHaveBeenCalledWith('opencode-1', 'hi');

    await sendTaskMessage(deps, { provider: 'antigravity', rawId: 'antigravity-1', message: 'hi' });
    expect(deps.antigravityService.sendFollowUp).toHaveBeenCalledWith('antigravity-1', 'hi');
  });

  test('routes cursor-cli ids to local ACP and other cursor ids to the cloud API', async () => {
    const deps = {
      configStore: { hasApiKey: jest.fn(() => true) },
      cursorService: { sendCliFollowUp: jest.fn(), addFollowUp: jest.fn() },
      claudeService: {},
      codexService: {},
      opencodeService: {},
      antigravityService: {},
      julesService: {},
    };

    await sendTaskMessage(deps, { provider: 'cursor', rawId: 'cursor-cli-9', message: 'local' });
    expect(deps.cursorService.sendCliFollowUp).toHaveBeenCalledWith('cursor-cli-9', 'local');
    expect(deps.cursorService.addFollowUp).not.toHaveBeenCalled();

    await sendTaskMessage(deps, { provider: 'cursor', rawId: 'bc-cloud', message: 'cloud' });
    expect(deps.cursorService.addFollowUp).toHaveBeenCalledWith('bc-cloud', 'cloud');
  });
});
