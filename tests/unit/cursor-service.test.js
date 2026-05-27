const fs = require('fs');
const path = require('path');

// Define mocks
const mockStat = jest.fn();
const mockReaddir = jest.fn();
const mockAccess = jest.fn();

// Mock modules
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
});
