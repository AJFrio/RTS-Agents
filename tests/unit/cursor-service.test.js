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
    access: mockAccess
  }
}));

const cursorService = require('../../src/main/services/cursor-service');

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
            { name: 'node_modules', isDirectory: () => true }
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
});
