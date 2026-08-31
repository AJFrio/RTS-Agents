jest.mock('../../src/main/services/project-service', () => ({
  resolveLocalProjectPath: jest.fn(async (raw) => raw),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(() => null),
}));

jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  enqueueDeviceTask: jest.fn(),
}));

const { createTask, sortAgentsByDate, REMOTE_TASK_PROVIDERS } = require(
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
