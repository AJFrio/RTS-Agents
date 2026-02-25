const fs = require('fs');
const path = require('path');

// Mock fs
const mockExistsSync = jest.fn();
const mockReaddirSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  promises: {
    mkdir: jest.fn()
  }
}));

// Mock child_process for project-service
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const projectService = require('../../src/main/services/project-service');

describe('ProjectService.scanDirectoriesForGitRepos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should find git repositories', async () => {
    const paths = ['/projects'];

    mockExistsSync.mockImplementation((p) => {
      if (p === '/projects') return true;
      // We need to use path.join logic to match platform specific paths
      // But here we are mocking, so we can just check if string contains
      if (p.includes('repo1') && p.endsWith('.git')) return true;
      if (p.includes('repo2') && p.endsWith('.git')) return false;
      return false;
    });

    mockReaddirSync.mockImplementation((p) => {
      if (p === '/projects') {
        return [
          { name: 'repo1', isDirectory: () => true },
          { name: 'repo2', isDirectory: () => true }, // No .git
          { name: 'file.txt', isDirectory: () => false },
          { name: 'node_modules', isDirectory: () => true } // Should be skipped by default
        ];
      }
      return [];
    });

    const repos = await projectService.scanDirectoriesForGitRepos(paths);

    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('repo1');
    expect(repos[0].path).toContain('repo1');
  });

  test('should skip hidden directories by default', async () => {
    const paths = ['/projects'];

    mockExistsSync.mockImplementation((p) => {
      if (p === '/projects') return true;
      if (p.includes('.hidden-repo') && p.endsWith('.git')) return true;
      return false;
    });

    mockReaddirSync.mockImplementation((p) => {
      return [
        { name: '.hidden-repo', isDirectory: () => true }
      ];
    });

    const repos = await projectService.scanDirectoriesForGitRepos(paths);

    expect(repos).toHaveLength(0);
  });

  test('should include hidden directories if skipHidden is false', async () => {
    const paths = ['/projects'];

    mockExistsSync.mockImplementation((p) => {
      if (p === '/projects') return true;
      if (p.includes('.hidden-repo') && p.endsWith('.git')) return true;
      return false;
    });

    mockReaddirSync.mockImplementation((p) => {
      return [
        { name: '.hidden-repo', isDirectory: () => true }
      ];
    });

    const repos = await projectService.scanDirectoriesForGitRepos(paths, { skipHidden: false });

    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('.hidden-repo');
  });

  test('should respect custom skip patterns', async () => {
    const paths = ['/projects'];

    mockExistsSync.mockImplementation((p) => {
      if (p === '/projects') return true;
      if (p.includes('repo1') && p.endsWith('.git')) return true;
      if (p.includes('custom-skip') && p.endsWith('.git')) return true;
      return false;
    });

    mockReaddirSync.mockImplementation((p) => {
      return [
        { name: 'repo1', isDirectory: () => true },
        { name: 'custom-skip', isDirectory: () => true }
      ];
    });

    const repos = await projectService.scanDirectoriesForGitRepos(paths, {
      skipPatterns: ['custom-skip']
    });

    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('repo1');
  });

  test('should skip base paths matching patterns', async () => {
    const paths = ['/projects/.gemini/tmp', '/projects/valid'];

    mockExistsSync.mockImplementation((p) => {
      if (p.includes('/projects/valid')) return true;
      if (p.includes('/projects/.gemini/tmp')) return true;
      return true; // assume all git paths exist for simplicity
    });

    mockReaddirSync.mockImplementation((p) => {
      if (p === '/projects/valid') {
        return [{ name: 'repo1', isDirectory: () => true }];
      }
      if (p === '/projects/.gemini/tmp') {
        return [{ name: 'repo2', isDirectory: () => true }];
      }
      return [];
    });

    const repos = await projectService.scanDirectoriesForGitRepos(paths, {
      skipPatterns: ['.gemini']
    });

    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('repo1');
  });

  test('should handle read errors gracefully', async () => {
    const paths = ['/projects'];

    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    // Should not throw, but log error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const repos = await projectService.scanDirectoriesForGitRepos(paths);

    expect(repos).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
