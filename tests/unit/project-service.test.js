const path = require('path');

// Define mocks
const mockExistsSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockMkdir = jest.fn();
const mockReaddir = jest.fn();
const mockAccess = jest.fn();
const mockExecFile = jest.fn();

// Mock modules
jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
}));

jest.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  readdir: mockReaddir,
  access: mockAccess,
}));

jest.mock('child_process', () => ({
  execFile: mockExecFile,
}));

const { pathExists } = require('../../src/main/utils/path-exists');

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

      pathExists.mockImplementation(async (p) => p === dir);

      mockExecFile.mockImplementation((file, args, opts, cb) => cb(null, 'stdout', 'stderr'));

      const result = await projectService.createLocalRepo({ directory: dir, name });

      expect(result).toContain('new-repo');
      expect(mockMkdir).toHaveBeenCalled();
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['init'],
        expect.objectContaining({ cwd: expect.stringContaining('new-repo') }),
        expect.any(Function)
      );
    });

    test('should fail if base dir does not exist', async () => {
      pathExists.mockResolvedValue(false);
      await expect(
        projectService.createLocalRepo({ directory: '/bad', name: 'repo' })
      ).rejects.toThrow('Base directory does not exist');
    });
  });

  describe('getLocalRepos', () => {
    test('should scan directories and return git repos', async () => {
      const paths = ['/path/1'];

      // Mock readdir for finding directories
      mockReaddir.mockImplementation(async (p) => {
        if (p === '/path/1') {
          return [
            { name: 'repo1', isDirectory: () => true },
            { name: 'not-repo', isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false },
            { name: '.hidden', isDirectory: () => true },
          ];
        }
        throw new Error('ENOENT');
      });

      // Mock access for checking .git existence
      mockAccess.mockImplementation(async (p) => {
        const repo1Git = path.join('/path/1', 'repo1', '.git');

        if (p === repo1Git) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
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
      pathExists.mockImplementation(async (p) => p === repoPath || p.endsWith('.git'));

      mockExecFile.mockImplementation((file, args, opts, cb) => cb(null, 'stdout', 'stderr'));

      const result = await projectService.pullRepo(repoPath);
      expect(result).toBe(repoPath);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['pull'],
        { cwd: repoPath },
        expect.any(Function)
      );
    });

    test('should fail if not a git repo', async () => {
      const repoPath = '/path/to/repo';
      pathExists.mockImplementation(async (p) => p === repoPath);

      await expect(projectService.pullRepo(repoPath)).rejects.toThrow('Not a git repository');
    });
  });
});
