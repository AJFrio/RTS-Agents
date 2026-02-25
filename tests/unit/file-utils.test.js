const path = require('path');

// Mock fs module
// Note: jest.mock is hoisted, so we define the factory inline
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}));

// Import fs to access the mocked functions
const fs = require('fs');
// Import the module under test
const fileUtils = require('../../src/main/utils/file-utils');

describe('file-utils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset default implementations
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
  });

  describe('scanDirectories', () => {
    test('should scan valid directories and return matching results', () => {
      const baseDir = '/base/dir';
      const subDirName = 'proj1';
      const subDirPath = path.resolve(baseDir, subDirName);

      // Setup mocks for this test
      fs.existsSync.mockImplementation((p) => {
        // Allow the base directory to exist
        return path.resolve(p) === path.resolve(baseDir);
      });

      fs.readdirSync.mockImplementation((p) => {
        // Return contents for the base directory
        if (path.resolve(p) === path.resolve(baseDir)) {
          return [
            { name: subDirName, isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false }
          ];
        }
        return [];
      });

      const predicate = jest.fn((entry, fullPath) => {
        if (entry.name === subDirName) {
          return { name: entry.name, path: fullPath };
        }
        return null;
      });

      const results = fileUtils.scanDirectories([baseDir], predicate);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ name: subDirName, path: subDirPath });
      expect(predicate).toHaveBeenCalledTimes(1);
    });

    test('should handle multiple base directories', () => {
      const dir1 = '/dir1';
      const dir2 = '/dir2';

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      fileUtils.scanDirectories([dir1, dir2], () => null);

      expect(fs.readdirSync).toHaveBeenCalledTimes(2);
    });

    test('should deduplicate base directories', () => {
      const dir1 = '/dir1';

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      fileUtils.scanDirectories([dir1, dir1], () => null);

      expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    });

    test('should handle non-existent directories gracefully', () => {
      const dir1 = '/dir1';
      fs.existsSync.mockReturnValue(false);

      const results = fileUtils.scanDirectories([dir1], () => true);

      expect(results).toHaveLength(0);
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    test('should handle fs errors gracefully', () => {
      const dir1 = '/dir1';
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const results = fileUtils.scanDirectories([dir1], () => true);

      expect(results).toHaveLength(0);
    });

    test('should ignore non-string directory inputs', () => {
      fileUtils.scanDirectories([null, undefined, 123], () => true);
      // fs.existsSync shouldn't be called for invalid inputs
      // But verify what IS called or not called
      // Since inputs are invalid, loop continues immediately
      expect(fs.existsSync).not.toHaveBeenCalled();
    });
  });
});
