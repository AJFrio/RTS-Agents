const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const child_process = require('child_process');

// Define mocks
const mockExistsSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockMkdir = jest.fn();
const mockExec = jest.fn();

// Mock modules
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync
}));

jest.mock('fs/promises', () => ({
  mkdir: mockMkdir
}));

jest.mock('child_process', () => ({
  exec: mockExec
}));

// Require service
const projectService = require('../../src/main/services/project-service');

describe('ProjectService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLocalRepo', () => {
    test('should create repo successfully', async () => {
      const dir = '/base/dir';
      const name = 'new-repo';
      const repoPath = path.join(dir, name);

      mockExistsSync.mockImplementation((p) => {
        if (p === dir) return true;
        if (p === repoPath) return false;
        return false;
      });

      mockExec.mockImplementation((cmd, opts, cb) => cb(null, 'stdout', 'stderr'));

      const result = await projectService.createLocalRepo({ directory: dir, name });

      expect(result).toContain('new-repo');
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith('git init', expect.objectContaining({ cwd: expect.stringContaining('new-repo') }), expect.any(Function));
    });

    test('should fail if base dir does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      await expect(projectService.createLocalRepo({ directory: '/bad', name: 'repo' }))
        .rejects.toThrow('Base directory does not exist');
    });
  });

  describe('getLocalRepos', () => {
    test('should scan directories and return git repos', async () => {
      const paths = ['/path/1'];

      mockExistsSync.mockImplementation((p) => {
        if (p === '/path/1') return true;
        // Construct the expected path for .git check
        const repo1Git = path.join('/path/1', 'repo1', '.git');
        const notRepoGit = path.join('/path/1', 'not-repo', '.git');

        if (p === repo1Git) return true; // It's a git repo
        if (p === notRepoGit) return false; // Not a git repo
        return false;
      });

      mockReaddirSync.mockImplementation((p) => {
        if (p === '/path/1') {
          return [
            { name: 'repo1', isDirectory: () => true },
            { name: 'not-repo', isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false },
            { name: '.hidden', isDirectory: () => true }
          ];
        }
        return [];
      });

      const result = await projectService.getLocalRepos(paths);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('repo1');
      expect(result[0].path).toContain('repo1');
    });

    test('should return empty array if no paths', async () => {
      const result = await projectService.getLocalRepos([]);
      expect(result).toEqual([]);
    });
  });

  describe('pullRepo', () => {
    test('should pull repo successfully', async () => {
      const repoPath = '/path/to/repo';
      mockExistsSync.mockImplementation((p) => {
        if (p === repoPath) return true;
        if (p.endsWith('.git')) return true;
        return false;
      });

      mockExec.mockImplementation((cmd, opts, cb) => cb(null, 'stdout', 'stderr'));

      const result = await projectService.pullRepo(repoPath);
      expect(result).toBe(repoPath);
      expect(mockExec).toHaveBeenCalledWith('git pull', { cwd: repoPath }, expect.any(Function));
    });

    test('should fail if not a git repo', async () => {
      const repoPath = '/path/to/repo';
      mockExistsSync.mockImplementation((p) => {
        if (p === repoPath) return true;
        return false; // .git missing
      });

      await expect(projectService.pullRepo(repoPath)).rejects.toThrow('Not a git repository');
    });
  });
});
