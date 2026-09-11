jest.mock('../../src/main/services/config-store', () => ({
  hasCloudflareConfig: jest.fn(),
  getOrCreateDeviceIdentity: jest.fn(),
}));

jest.mock('../../src/main/services/cloudflare-kv-service', () => ({
  upsertRuns: jest.fn(),
}));

const configStore = require('../../src/main/services/config-store');
const cloudflareKvService = require('../../src/main/services/cloudflare-kv-service');
const runBroadcasterService = require('../../src/main/services/run-broadcaster-service');

describe('run-broadcaster-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runBroadcasterService.stop();
  });

  afterEach(() => {
    runBroadcasterService.stop();
  });

  describe('agentToRun', () => {
    it('maps a discovery agent to a device-scoped run entry', () => {
      const identity = { id: 'device-1', name: 'Laptop' };
      const run = runBroadcasterService.agentToRun(
        {
          id: 'abc',
          provider: 'claude-cli',
          name: 'Fix the bug',
          status: 'running',
          repository: '/home/me/project',
          repoRemote: 'github.com/me/project',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:05:00Z',
        },
        identity
      );

      expect(run).toMatchObject({
        id: 'device-1:abc',
        localTaskId: 'abc',
        deviceId: 'device-1',
        deviceName: 'Laptop',
        provider: 'claude-cli',
        name: 'Fix the bug',
        status: 'running',
        repo: 'github.com/me/project',
      });
    });

    it('returns null for agents without an id', () => {
      expect(
        runBroadcasterService.agentToRun({ provider: 'claude-cli' }, { id: 'd', name: 'd' })
      ).toBeNull();
    });

    it('normalizes unknown statuses', () => {
      const identity = { id: 'device-1', name: 'Laptop' };
      expect(runBroadcasterService.agentToRun({ id: 'x', status: 'RUNNING' }, identity).status).toBe(
        'running'
      );
      expect(runBroadcasterService.agentToRun({ id: 'x', status: 'queued' }, identity).status).toBe(
        'running'
      );
      expect(runBroadcasterService.agentToRun({ id: 'x' }, identity).status).toBe('unknown');
    });
  });

  describe('broadcastLocalRuns', () => {
    it('skips when Cloudflare is not configured', async () => {
      configStore.hasCloudflareConfig.mockReturnValue(false);

      const result = await runBroadcasterService.broadcastLocalRuns(
        {
          agentDiscoveryCache: { peekAgents: () => [] },
          ensureCloudflareNamespaceId: async () => 'ns-1',
        },
        { immediate: true }
      );

      expect(result).toBeNull();
      expect(cloudflareKvService.upsertRuns).not.toHaveBeenCalled();
    });

    it('upserts slimmed local runs into the KV run log', async () => {
      configStore.hasCloudflareConfig.mockReturnValue(true);
      configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'device-1', name: 'Laptop' });
      cloudflareKvService.upsertRuns.mockResolvedValue([]);

      const deps = {
        agentDiscoveryCache: {
          peekAgents: () => [
            {
              id: 'run-a',
              provider: 'opencode',
              name: 'Refactor',
              status: 'completed',
              repository: '/home/me/project',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
        ensureCloudflareNamespaceId: async () => 'ns-1',
      };

      const result = await runBroadcasterService.broadcastLocalRuns(deps, { immediate: true });

      expect(result).toEqual([]);
      expect(cloudflareKvService.upsertRuns).toHaveBeenCalledWith('ns-1', [
        expect.objectContaining({
          id: 'device-1:run-a',
          deviceId: 'device-1',
          provider: 'opencode',
          status: 'completed',
        }),
      ]);
    });

    it('does not throw when the KV write fails', async () => {
      configStore.hasCloudflareConfig.mockReturnValue(true);
      configStore.getOrCreateDeviceIdentity.mockReturnValue({ id: 'device-1', name: 'Laptop' });
      cloudflareKvService.upsertRuns.mockRejectedValue(new Error('kv down'));

      const deps = {
        agentDiscoveryCache: { peekAgents: () => [] },
        ensureCloudflareNamespaceId: async () => 'ns-1',
      };

      await expect(
        runBroadcasterService.broadcastLocalRuns(deps, { immediate: true })
      ).resolves.toBeNull();
    });
  });
});
