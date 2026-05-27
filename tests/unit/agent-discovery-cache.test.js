jest.mock('../../src/main/ipc/provider-registry', () => ({
  fetchAllAgents: jest.fn(),
}));

const { fetchAllAgents } = require('../../src/main/ipc/provider-registry');
const agentDiscoveryCache = require('../../src/main/services/agent-discovery-cache');

describe('agent-discovery-cache', () => {
  const deps = {
    configStore: {
      getPollingInterval: () => 30000,
      getAllProjectPaths: () => [],
      getGeminiPaths: () => [],
      getClaudePaths: () => [],
      hasApiKey: () => false,
      getCodexThreads: () => [],
      getClaudeConversations: () => [],
      getOpenCodeSessions: () => [],
    },
    geminiService: { getDefaultPath: () => '/mock/.gemini/tmp' },
    claudeService: { getDefaultPath: () => '/mock/.claude' },
  };

  beforeEach(() => {
    agentDiscoveryCache.invalidate();
    agentDiscoveryCache.snapshot = null;
    agentDiscoveryCache.revision = 0;
    agentDiscoveryCache.lastCloudFetchAt = 0;
    agentDiscoveryCache.localFingerprint = null;
    agentDiscoveryCache.configSignature = null;
    jest.clearAllMocks();
  });

  test('returns unchanged when fingerprint matches and revision matches', async () => {
    fetchAllAgents.mockResolvedValue({
      agents: [{ id: '1', updatedAt: '2025-01-02' }],
      counts: { total: 1 },
      errors: [],
    });

    const first = await agentDiscoveryCache.getAgents(deps, { force: true });
    expect(first.full).toBe(true);
    expect(first.agents).toHaveLength(1);

    const second = await agentDiscoveryCache.getAgents(deps, {
      sinceRevision: first.revision,
    });
    expect(second.unchanged).toBe(true);
    expect(fetchAllAgents).toHaveBeenCalledTimes(1);
  });

  test('returns delta when list changes and client revision matches', async () => {
    fetchAllAgents
      .mockResolvedValueOnce({
        agents: [
          {
            id: '1',
            status: 'running',
            updatedAt: '1',
            name: 'x',
            summary: '',
            prompt: '',
            repository: '',
          },
        ],
        counts: { total: 1 },
        errors: [],
      })
      .mockResolvedValueOnce({
        agents: [
          {
            id: '1',
            status: 'completed',
            updatedAt: '2',
            name: 'x',
            summary: '',
            prompt: '',
            repository: '',
          },
          {
            id: '2',
            status: 'running',
            updatedAt: '3',
            name: 'y',
            summary: '',
            prompt: '',
            repository: '',
          },
        ],
        counts: { total: 2 },
        errors: [],
      });

    const first = await agentDiscoveryCache.getAgents(deps, { force: true });
    agentDiscoveryCache.localFingerprint = null;

    const second = await agentDiscoveryCache.getAgents(deps, {
      sinceRevision: first.revision,
    });

    expect(second.full).toBe(false);
    expect(second.delta.added).toHaveLength(1);
    expect(second.delta.updated).toHaveLength(1);
  });
});
