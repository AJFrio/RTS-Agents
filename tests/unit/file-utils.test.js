const path = require('path');

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

describe('FileUtils', () => {
  let fs;
  let scanDirectories;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    fs = require('fs');
    // Re-require the module under test to ensure it uses the fresh fs mock/instance if resetModules does anything to it
    // although with jest.mock factory it should be consistent, but let's be safe.
    const fileUtils = require('../../src/main/utils/file-utils');
    scanDirectories = fileUtils.scanDirectories;
  });

  describe('scanDirectories', () => {
    test('should return empty array if no base paths provided', () => {
      const results = scanDirectories([], { checkFn: () => true, mapFn: () => {} });
      expect(results).toEqual([]);
    });

    test('should skip non-existent base paths', () => {
      fs.existsSync.mockReturnValue(false);
      const results = scanDirectories(['/non-existent'], { checkFn: () => true, mapFn: () => {} });
      expect(results).toEqual([]);
      expect(fs.existsSync).toHaveBeenCalledWith('/non-existent');
    });

    test('should scan directories and return matching projects', () => {
      const basePath = '/projects';
      fs.existsSync.mockImplementation((p) => p === basePath);

      fs.readdirSync.mockReturnValue([
        { name: 'proj1', isDirectory: () => true },
        { name: 'proj2', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false }, // Should be skipped
      ]);

      const checkFn = jest.fn((p, name) => name === 'proj1' ? { id: 1 } : null);
      const mapFn = jest.fn((p, name, checkResult) => ({ path: p, name, ...checkResult }));

      const results = scanDirectories([basePath], { checkFn, mapFn });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ path: path.join(basePath, 'proj1'), name: 'proj1', id: 1 });
      expect(checkFn).toHaveBeenCalledTimes(2); // proj1 and proj2
      expect(mapFn).toHaveBeenCalledTimes(1); // only proj1 matched
    });

    test('should skip directories based on shouldSkip', () => {
      const basePath = '/projects';
      fs.existsSync.mockImplementation((p) => p === basePath);

      fs.readdirSync.mockReturnValue([
        { name: 'proj1', isDirectory: () => true },
        { name: 'ignored', isDirectory: () => true },
      ]);

      const shouldSkip = jest.fn((name) => name === 'ignored');
      const checkFn = jest.fn(() => true);
      const mapFn = jest.fn((p, name) => ({ name }));

      const results = scanDirectories([basePath], { checkFn, mapFn, shouldSkip });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('proj1');
      expect(shouldSkip).toHaveBeenCalledWith('proj1');
      expect(shouldSkip).toHaveBeenCalledWith('ignored');
      expect(checkFn).toHaveBeenCalledTimes(1); // only proj1 checked
    });

    test('should deduplicate projects based on path', () => {
      const basePath = '/projects';
      fs.existsSync.mockImplementation((p) => p === basePath);

      // Simulating scanning the same directory twice via different base paths or just because
      fs.readdirSync.mockReturnValue([
        { name: 'proj1', isDirectory: () => true },
      ]);

      const checkFn = jest.fn(() => true);
      const mapFn = jest.fn((p, name) => ({ path: p }));

      // Pass same base path twice
      const results = scanDirectories([basePath, basePath], { checkFn, mapFn });

      expect(results).toHaveLength(1);
      // fs.readdirSync should be called once because scanDirectories dedupes base paths
      expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    });

    test('should deduplicate projects if found in multiple scans', () => {
        const basePath1 = '/dir1';
        const basePath2 = '/dir2';

        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation((p) => {
            if (p === basePath1) return [{ name: 'proj1', isDirectory: () => true }];
            if (p === basePath2) return [{ name: 'proj1', isDirectory: () => true }];
            return [];
        });

        const checkFn = jest.fn(() => true);
        const mapFn = jest.fn((p) => ({ path: p }));

        const results = scanDirectories([basePath1, basePath2], { checkFn, mapFn });

        expect(results).toHaveLength(2);
        expect(results[0].path).toBe(path.join(basePath1, 'proj1'));
        expect(results[1].path).toBe(path.join(basePath2, 'proj1'));
    });

    test('should handle duplicate base paths correctly', () => {
       const basePath = '/dir1';
       fs.existsSync.mockReturnValue(true);
       fs.readdirSync.mockReturnValue([{ name: 'proj1', isDirectory: () => true }]);

       const results = scanDirectories([basePath, basePath], { checkFn: () => true, mapFn: () => ({}) });

       expect(fs.readdirSync).toHaveBeenCalledTimes(1);
       expect(results).toHaveLength(1);
    });

    test('should use default shouldSkip if not provided', () => {
      const basePath = '/projects';
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        { name: 'bin', isDirectory: () => true }, // default ignored
        { name: 'cache', isDirectory: () => true }, // default ignored
        { name: 'tmp', isDirectory: () => true }, // default ignored
        { name: 'node_modules', isDirectory: () => true }, // default ignored
        { name: '.git', isDirectory: () => true }, // default ignored (startsWith .)
        { name: 'valid', isDirectory: () => true },
      ]);

      const checkFn = jest.fn(() => true);
      const mapFn = jest.fn((p, name) => ({ name }));

      const results = scanDirectories([basePath], { checkFn, mapFn });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('valid');
    });

    test('should handle readdirSync error gracefully', () => {
        const basePath = '/projects';
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockImplementation(() => { throw new Error('Permission denied'); });

        const results = scanDirectories([basePath], { checkFn: () => true, mapFn: () => {} });

        expect(results).toEqual([]);
    });

    test('should handle checkFn returning null/false', () => {
        const basePath = '/projects';
        fs.existsSync.mockReturnValue(true);
        fs.readdirSync.mockReturnValue([{ name: 'proj1', isDirectory: () => true }]);

        const checkFn = jest.fn(() => null);
        const mapFn = jest.fn();

        const results = scanDirectories([basePath], { checkFn, mapFn });

        expect(results).toEqual([]);
        expect(mapFn).not.toHaveBeenCalled();
    });
  });
});
