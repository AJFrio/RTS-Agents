const fs = require('fs');
const path = require('path');

// Define mocks
const mockStat = jest.fn();
const mockReaddir = jest.fn();
const mockAccess = jest.fn();

// Mock modules
jest.mock('../../src/main/services/config-store', () => ({
  setCursorCliSessions: jest.fn(),
  getCursorCliSessions: jest.fn(() => []),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(),
  runPrompt: jest.fn(),
  clearAdapterCache: jest.fn(),
  pickPermissionOption: jest.fn(),
  buildSpawnArgs: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    stat: mockStat,
    readdir: mockReaddir,
    access: mockAccess,
  },
}));

const cursorService = require('../../src/main/services/cursor-service');
const httpService = require('../../src/main/services/http-service');
const acpService = require('../../src/main/services/acp-service');
const configStore = require('../../src/main/services/config-store');

describe('CursorService Unit Tests (Local Repos - Async)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableLocalRepositories', () => {
    test('should scan directories and return git repos asynchronously', async () => {
      const paths = ['/path/1'];

      mockStat.mockImplementation(async (p) => {
        if (p === '/path/1') return { isDirectory: () => true };
        throw new Error('Not found');
      });

      mockReaddir.mockImplementation(async (p) => {
        if (p === '/path/1') {
          return [
            { name: 'repo1', isDirectory: () => true },
            { name: 'not-repo', isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false },
            { name: '.hidden', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ];
        }
        return [];
      });

      mockAccess.mockImplementation(async (p) => {
        const repo1Git = path.join('/path/1', 'repo1', '.git');
        if (p === repo1Git) return; // Success
        throw new Error('No access');
      });

      const result = await cursorService.getAvailableLocalRepositories(paths);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('repo1');
      expect(result[0].path).toBe(path.join('/path/1', 'repo1'));

      expect(mockStat).toHaveBeenCalledWith('/path/1');
      expect(mockReaddir).toHaveBeenCalledWith('/path/1', { withFileTypes: true });
      expect(mockAccess).toHaveBeenCalledWith(path.join('/path/1', 'repo1', '.git'));
    });

    test('should return empty array if no paths exist', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const result = await cursorService.getAvailableLocalRepositories(['/bad/path']);
      expect(result).toEqual([]);
    });

    test('should handle duplicate paths', async () => {
      mockStat.mockImplementation(async (p) => {
        if (p === '/path/1') return { isDirectory: () => true };
        throw new Error('Not found');
      });
      mockReaddir.mockResolvedValue([]);

      await cursorService.getAvailableLocalRepositories(['/path/1', '/path/1']);
      expect(mockStat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cursor v1 API', () => {
    beforeEach(() => {
      cursorService.setApiKey('cursor-key');
      jest.spyOn(httpService, 'requestJson').mockReset();
    });

    test('testConnection probes /v1/me and returns health details', async () => {
      httpService.requestJson.mockResolvedValue({
        apiKeyName: 'Test Key',
        userEmail: 'dev@example.com',
      });

      const result = await cursorService.testConnection();

      expect(httpService.requestJson).toHaveBeenCalledWith(
        'https://api.cursor.com/v1/me',
        'GET',
        null,
        expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }),
        60000
      );
      expect(result).toMatchObject({
        provider: 'cursor',
        success: true,
        endpointLabel: 'GET /v1/me',
      });
    });

    test('getAllAgents maps v1 list items and latest run status', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.includes('/agents?')) {
          return {
            items: [
              {
                id: 'bc-1',
                name: 'Agent',
                status: 'ACTIVE',
                url: 'https://cursor.com/agents/bc-1',
                createdAt: '2026-04-13T18:30:00.000Z',
                latestRunId: 'run-1',
              },
            ],
          };
        }
        if (url.includes('/runs/run-1')) {
          return {
            id: 'run-1',
            status: 'FINISHED',
            updatedAt: '2026-04-13T18:45:00.000Z',
            result: 'Done',
            git: {
              branches: [
                {
                  repoUrl: 'github.com/o/r',
                  branch: 'cursor/fix',
                  prUrl: 'https://github.com/o/r/pull/1',
                },
              ],
            },
          };
        }
        return {};
      });

      const agents = await cursorService.getAllAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        id: 'cursor-bc-1',
        status: 'completed',
        branch: 'cursor/fix',
        prUrl: 'https://github.com/o/r/pull/1',
      });
    });

    test('getAllAgents does not treat durable ACTIVE agent status as running', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.includes('/agents?')) {
          return {
            items: [
              {
                id: 'bc-1',
                name: 'Agent',
                status: 'ACTIVE',
                createdAt: '2026-04-13T18:30:00.000Z',
                latestRunId: 'run-1',
              },
            ],
          };
        }
        if (url.includes('/runs/run-1')) {
          const error = new Error('Run detail unavailable');
          error.statusCode = 404;
          throw error;
        }
        if (url.includes('/runs?')) {
          return { items: [] };
        }
        return {};
      });

      const agents = await cursorService.getAllAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].status).toBe('completed');
    });

    test('getAgentDetails uses v1 runs for status, summary, and activity', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.endsWith('/agents/bc-1')) {
          return {
            id: 'bc-1',
            name: 'Agent',
            status: 'ACTIVE',
            latestRunId: 'run-1',
            repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
          };
        }
        if (url.includes('/runs?')) {
          return {
            items: [
              {
                id: 'run-1',
                status: 'FINISHED',
                updatedAt: '2026-04-13T18:45:00.000Z',
              },
            ],
          };
        }
        if (url.includes('/runs/run-1')) {
          return {
            id: 'run-1',
            status: 'FINISHED',
            result: 'Done',
            updatedAt: '2026-04-13T18:45:00.000Z',
          };
        }
        return {};
      });

      const details = await cursorService.getAgentDetails('bc-1');

      expect(details).toMatchObject({
        rawId: 'bc-1',
        status: 'completed',
        summary: 'Done',
      });
      expect(details.conversation).toEqual([
        expect.objectContaining({ id: 'run-1', text: 'Done', isUser: false }),
      ]);
      expect(details.activities).toEqual([
        expect.objectContaining({ id: 'run-1', type: 'cursor_run', title: 'Run FINISHED' }),
      ]);
    });

    test('getAgentDetails strips cursor- prefix from agent id', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.endsWith('/agents/bc-1')) {
          return { id: 'bc-1', name: 'Agent', status: 'ACTIVE', latestRunId: 'run-1' };
        }
        if (url.includes('/runs?')) {
          return { items: [{ id: 'run-1', status: 'RUNNING' }] };
        }
        if (url.includes('/runs/run-1')) {
          return { id: 'run-1', status: 'RUNNING' };
        }
        return {};
      });

      const details = await cursorService.getAgentDetails('cursor-bc-1');

      expect(httpService.requestJson).toHaveBeenCalledWith(
        'https://api.cursor.com/v1/agents/bc-1',
        'GET',
        null,
        expect.any(Object),
        60000
      );
      expect(details.rawId).toBe('bc-1');
      expect(details.activities.length).toBeGreaterThan(0);
    });

    test('getAgentDetails unwraps wrapped agent response', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.endsWith('/agents/bc-1')) {
          return {
            agent: {
              id: 'bc-1',
              name: 'Wrapped agent',
              status: 'ACTIVE',
              latestRunId: 'run-1',
              repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
            },
          };
        }
        if (url.includes('/runs?')) {
          return { items: [{ id: 'run-1', status: 'RUNNING' }] };
        }
        if (url.includes('/runs/run-1')) {
          return { id: 'run-1', status: 'RUNNING' };
        }
        return {};
      });

      const details = await cursorService.getAgentDetails('bc-1');

      expect(details).toMatchObject({
        rawId: 'bc-1',
        name: 'Wrapped agent',
        repository: 'https://github.com/o/r',
        branch: 'main',
      });
      expect(details.activities).toHaveLength(1);
    });

    test('getAgentDetails hydrates list runs without result via getRun', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.endsWith('/agents/bc-1')) {
          return { id: 'bc-1', name: 'Agent', status: 'ACTIVE', latestRunId: 'run-1' };
        }
        if (url.includes('/runs?')) {
          return {
            items: [{ id: 'run-1', status: 'FINISHED', updatedAt: '2026-04-13T18:45:00.000Z' }],
          };
        }
        if (url.includes('/runs/run-1')) {
          return {
            id: 'run-1',
            status: 'FINISHED',
            result: 'Hydrated result',
            updatedAt: '2026-04-13T18:45:00.000Z',
          };
        }
        return {};
      });

      const details = await cursorService.getAgentDetails('bc-1');

      expect(details.summary).toBe('Hydrated result');
      expect(details.conversation).toEqual([
        expect.objectContaining({ text: 'Hydrated result' }),
      ]);
      expect(details.activities[0].description).toContain('Hydrated result');
    });

    test('getAgentDetails shows activity and metadata for in-progress runs', async () => {
      httpService.requestJson.mockImplementation(async (url) => {
        if (url.endsWith('/agents/bc-1')) {
          return {
            id: 'bc-1',
            name: 'In progress',
            status: 'ACTIVE',
            latestRunId: 'run-1',
            repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
          };
        }
        if (url.includes('/runs?')) {
          return { items: [{ id: 'run-1', status: 'RUNNING', createdAt: '2026-04-13T18:30:00.000Z' }] };
        }
        if (url.includes('/runs/run-1')) {
          return { id: 'run-1', status: 'RUNNING', createdAt: '2026-04-13T18:30:00.000Z' };
        }
        return {};
      });

      const details = await cursorService.getAgentDetails('bc-1');

      expect(details.summary).toBe('In progress');
      expect(details.repository).toBe('https://github.com/o/r');
      expect(details.activities).toEqual([
        expect.objectContaining({ id: 'run-1', title: 'Run RUNNING' }),
      ]);
      expect(details.conversation).toEqual([]);
    });

    test('createAgent sends v1 repos payload', async () => {
      httpService.requestJson.mockResolvedValue({
        agent: {
          id: 'bc-2',
          status: 'ACTIVE',
          repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
        },
        run: { id: 'run-2', status: 'CREATING' },
      });

      const result = await cursorService.createAgent({
        prompt: 'Fix bug',
        repository: 'https://github.com/o/r',
        ref: 'main',
        autoCreatePr: true,
        model: 'composer-2',
      });

      expect(httpService.requestJson).toHaveBeenCalledWith(
        'https://api.cursor.com/v1/agents',
        'POST',
        expect.objectContaining({
          prompt: { text: 'Fix bug' },
          repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
          autoCreatePR: true,
          model: { id: 'composer-2' },
        }),
        expect.any(Object),
        60000
      );
      expect(result.rawId).toBe('bc-2');
    });
  });

  describe('ACP local dispatch', () => {
    function mockAcp(overrides = {}) {
      acpService.resolveAdapter.mockReturnValue('agent');
      acpService.runPrompt.mockImplementation(({ onSessionId, onUpdate }) => {
        if (overrides.onRun) overrides.onRun({ onSessionId, onUpdate });
        return overrides.promise || Promise.resolve({ sessionId: 'acp-1', stopReason: 'end_turn' });
      });
    }

    beforeEach(() => {
      cursorService.setCursorCliSessions([]);
    });

    test('startCliSession dispatches via ACP, coalesces chunks, and completes', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockAcp({
        onRun: ({ onSessionId, onUpdate }) => {
          onSessionId('acp-1');
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } },
            'acp-1'
          );
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world' } },
            'acp-1'
          );
        },
      });

      const result = await cursorService.startCliSession({
        prompt: 'Fix the login bug',
        projectPath: '/repo',
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(acpService.runPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'agent',
          args: ['acp'],
          cwd: '/repo',
          prompt: 'Fix the login bug',
          permissionPolicy: 'allow-all',
        })
      );
      expect(result).toMatchObject({
        provider: 'cursor',
        source: 'local',
        status: 'running',
        repository: '/repo',
      });

      const tracked = cursorService.getCursorCliSessions();
      expect(tracked).toHaveLength(1);
      expect(tracked[0]).toMatchObject({
        status: 'completed',
        prompt: 'Fix the login bug',
      });
      expect(tracked[0].streamMessages).toHaveLength(1);
      expect(tracked[0].streamMessages[0].content).toBe('Hello world');
      expect(configStore.setCursorCliSessions).toHaveBeenCalled();
    });

    test('throws when the Cursor CLI is not installed', async () => {
      mockAccess.mockResolvedValue(undefined);
      acpService.resolveAdapter.mockReturnValue(null);

      await expect(
        cursorService.startCliSession({ prompt: 'Fix it', projectPath: '/repo' })
      ).rejects.toThrow('Cursor CLI not found');
      expect(cursorService.getCursorCliSessions()).toHaveLength(0);
    });

    test('cleans up and rejects when ACP fails before start', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockAcp({
        promise: Promise.reject(
          Object.assign(new Error('Failed to start ACP adapter'), {
            phase: 'spawn',
            fallbackAllowed: true,
          })
        ),
      });

      await expect(
        cursorService.startCliSession({ prompt: 'Fix it', projectPath: '/repo' })
      ).rejects.toThrow('Failed to start ACP adapter');
      expect(cursorService.getCursorCliSessions()).toHaveLength(0);
    });

    test('marks the tracked session failed when ACP fails after start', async () => {
      mockAccess.mockResolvedValue(undefined);
      mockAcp({
        onRun: ({ onSessionId }) => onSessionId('acp-1'),
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await cursorService.startCliSession({ prompt: 'Fix it', projectPath: '/repo' });
      await Promise.resolve();
      await Promise.resolve();

      expect(cursorService.getCursorCliSessions()[0]).toMatchObject({
        status: 'failed',
        error: 'ACP adapter exited (code 1)',
      });
    });

    test('getAllAgents surfaces tracked local sessions without an API key', async () => {
      cursorService.setCursorCliSessions([
        {
          id: 'cursor-cli-1-abc',
          prompt: 'Fix the bug',
          projectPath: '/repo',
          status: 'running',
          streamMessages: [{ role: 'assistant', content: 'Step one' }],
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:01:00.000Z',
        },
      ]);

      const agents = await cursorService.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        id: 'cursor-cli-1-abc',
        provider: 'cursor',
        source: 'local',
        status: 'running',
      });
    });

    test('getAgentDetails returns tracked messages for cursor-cli ids', async () => {
      cursorService.setCursorCliSessions([
        {
          id: 'cursor-cli-1-abc',
          prompt: 'Fix the bug',
          projectPath: '/repo',
          status: 'completed',
          streamMessages: [{ role: 'assistant', content: 'All done', id: 'stream-0' }],
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:01:00.000Z',
        },
      ]);

      const details = await cursorService.getAgentDetails('cursor-cli-1-abc');
      expect(details.status).toBe('completed');
      expect(details.messages).toEqual([
        expect.objectContaining({ role: 'user', content: 'Fix the bug' }),
        expect.objectContaining({ role: 'assistant', content: 'All done' }),
      ]);
    });
  });
});
