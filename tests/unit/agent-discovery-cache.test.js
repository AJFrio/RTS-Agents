const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/main/ipc/provider-registry', () => ({
  fetchAllAgents: jest.fn()
}));

const { fetchAllAgents } = require('../../src/main/ipc/provider-registry');
const agentDiscoveryCache = require('../../src/main/services/agent-discovery-cache');
const repoRemoteCache = require('../../src/main/services/repo-remote-cache');

describe('agent-discovery-cache', () => {
  const deps = {
    configStore: {
      getPollingInterval: () => 30000,
      getAllProjectPaths: () => [],
      getAntigravityPaths: () => [],
      getClaudePaths: () => [],
      hasApiKey: () => false,
      getCodexThreads: () => [],
      getClaudeConversations: () => [],
      getOpenCodeSessions: () => [],
      getAntigravitySessions: () => []
    },
    antigravityService: { getDefaultDataPath: () => '/mock/.gemini/antigravity-cli' },
    claudeService: { getDefaultPath: () => '/mock/.claude' }
  };

  beforeEach(() => {
    agentDiscoveryCache.invalidate();
    agentDiscoveryCache.snapshot = null;
    agentDiscoveryCache.revision = 0;
    agentDiscoveryCache.lastCloudFetchAt = 0;
    agentDiscoveryCache.localFingerprint = null;
    agentDiscoveryCache.configSignature = null;
    agentDiscoveryCache.hydrated = false;
    agentDiscoveryCache.persistPath = null;
    agentDiscoveryCache.onSnapshotChange = null;
    agentDiscoveryCache.refreshRemotesInFlight = null;
    if (agentDiscoveryCache.persistTimer) {
      clearTimeout(agentDiscoveryCache.persistTimer);
      agentDiscoveryCache.persistTimer = null;
    }
    agentDiscoveryCache.remoteCache = {
      applyToAgents: (agents) => agents,
      refreshMissing: async () => false,
      hydrate: () => {},
      serialize: () => ({})
    };
    repoRemoteCache.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (agentDiscoveryCache.persistTimer) {
      clearTimeout(agentDiscoveryCache.persistTimer);
      agentDiscoveryCache.persistTimer = null;
    }
  });

  test('returns unchanged when fingerprint matches and revision matches', async () => {
    fetchAllAgents.mockResolvedValue({
      agents: [{ id: '1', updatedAt: '2025-01-02' }],
      counts: { total: 1 },
      errors: []
    });

    const first = await agentDiscoveryCache.getAgents(deps, { force: true });
    expect(first.full).toBe(true);
    expect(first.agents).toHaveLength(1);

    const second = await agentDiscoveryCache.getAgents(deps, {
      sinceRevision: first.revision
    });
    expect(second.unchanged).toBe(true);
    expect(fetchAllAgents).toHaveBeenCalledTimes(1);
  });

  test('returns delta when list changes and client revision matches', async () => {
    fetchAllAgents
      .mockResolvedValueOnce({
        agents: [{ id: '1', status: 'running', updatedAt: '1', name: 'x', summary: '', prompt: '', repository: '' }],
        counts: { total: 1 },
        errors: []
      })
      .mockResolvedValueOnce({
        agents: [
          { id: '1', status: 'completed', updatedAt: '2', name: 'x', summary: '', prompt: '', repository: '' },
          { id: '2', status: 'running', updatedAt: '3', name: 'y', summary: '', prompt: '', repository: '' }
        ],
        counts: { total: 2 },
        errors: []
      });

    const first = await agentDiscoveryCache.getAgents(deps, { force: true });
    agentDiscoveryCache.localFingerprint = null;

    const second = await agentDiscoveryCache.getAgents(deps, {
      sinceRevision: first.revision
    });

    expect(second.full).toBe(false);
    expect(second.delta.added).toHaveLength(1);
    expect(second.delta.updated).toHaveLength(1);
  });

  test('peekAgents returns the in-memory snapshot without a rescan', async () => {
    expect(agentDiscoveryCache.peekAgents()).toBeNull();

    fetchAllAgents.mockResolvedValue({
      agents: [{ id: '1', status: 'running' }],
      counts: { total: 1 },
      errors: []
    });

    await agentDiscoveryCache.getAgents(deps, { force: true });
    const peeked = agentDiscoveryCache.peekAgents();

    expect(peeked).toEqual([{ id: '1', status: 'running' }]);
    expect(fetchAllAgents).toHaveBeenCalledTimes(1);

    agentDiscoveryCache.invalidate();
    expect(agentDiscoveryCache.peekAgents()).toEqual([{ id: '1', status: 'running' }]);
    expect(fetchAllAgents).toHaveBeenCalledTimes(1);
  });

  test('collectWatchRoots excludes configured project repos', () => {
    const projectRepo = 'D:\\GitHub\\MyRepo';
    const roots = agentDiscoveryCache.collectWatchRoots({
      configStore: {
        getAllProjectPaths: () => [projectRepo],
        getAntigravityPaths: () => [],
        getClaudePaths: () => [],
      },
      antigravityService: { getDefaultDataPath: () => '/mock/.gemini/antigravity-cli' },
      claudeService: { getDefaultPath: () => '/mock/.claude' },
    });
    expect(roots).not.toContain(projectRepo);
    expect(roots.some((root) => String(root).includes('.opencode'))).toBe(true);
    expect(roots.some((root) => String(root).includes('.claude'))).toBe(true);
  });

  test('hydrateSync restores the last snapshot from disk', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rts-snapshot-'));
    const persistPath = path.join(dir, 'agent-discovery-snapshot.json');
    fs.writeFileSync(
      persistPath,
      JSON.stringify({
        version: 1,
        revision: 4,
        agents: [
          {
            id: 'local-1',
            provider: 'claude-cli',
            status: 'running',
            repository: '/tmp/open-shop',
            name: 'Cached task',
          },
        ],
        counts: { total: 1, 'claude-cli': 1 },
        remotes: { '/tmp/open-shop': 'github.com/ajfrio/open-shop' },
      })
    );

    agentDiscoveryCache.remoteCache = repoRemoteCache;
    agentDiscoveryCache.configurePersist({ persistPath });
    agentDiscoveryCache.hydrateSync();

    const peeked = agentDiscoveryCache.peekAgents();
    expect(peeked).toHaveLength(1);
    expect(peeked[0].name).toBe('Cached task');
    expect(peeked[0].repoRemote).toBe('github.com/ajfrio/open-shop');
    expect(agentDiscoveryCache.revision).toBe(4);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('persistNow writes a slim snapshot that hydrateSync can reload', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rts-snapshot-'));
    const persistPath = path.join(dir, 'agent-discovery-snapshot.json');
    agentDiscoveryCache.configurePersist({ persistPath });

    fetchAllAgents.mockResolvedValue({
      agents: [
        {
          id: '1',
          provider: 'cursor',
          status: 'completed',
          repository: 'https://github.com/ajfrio/open-shop',
          name: 'Cloud',
          streamMessages: [{ role: 'assistant', content: 'nope' }],
        },
      ],
      counts: { total: 1, cursor: 1 },
      errors: [],
    });

    await agentDiscoveryCache.getAgents(deps, { force: true });
    agentDiscoveryCache.persistNow();

    const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.agents[0].id).toBe('1');
    expect(raw.agents[0].streamMessages).toBeUndefined();

    agentDiscoveryCache.snapshot = null;
    agentDiscoveryCache.hydrated = false;
    agentDiscoveryCache.hydrateSync();
    expect(agentDiscoveryCache.peekAgents()[0].name).toBe('Cloud');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
