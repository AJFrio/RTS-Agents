const path = require('path');
const os = require('os');

// Define mock functions outside the factory so we can control them in tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    promises: {
      access: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      readFile: jest.fn(),
    }
  };
});

jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home'),
}));

// Now import the mocked module.
const fs = require('fs');
const fsPromises = fs.promises;
const geminiService = require('../../src/main/services/gemini-service');

describe('GeminiService Unit Tests', () => {
  const mockHomeDir = '/mock/home';

  beforeEach(() => {
    // Clear mock history before each test
    jest.clearAllMocks();
  });

  describe('isGeminiInstalled', () => {
    test('should return true if base directory exists', () => {
      // Control the mock
      fs.existsSync.mockReturnValue(true);

      expect(geminiService.isGeminiInstalled()).toBe(true);
      expect(fs.existsSync).toHaveBeenCalled();
    });

    test('should return false if base directory does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      expect(geminiService.isGeminiInstalled()).toBe(false);
    });
  });

  describe('discoverProjects', () => {
    test('should discover projects in given paths', async () => {
      const scanPath = '/scan/path';

      fsPromises.access.mockResolvedValue(undefined);
      fsPromises.readdir.mockImplementation(async (p) => {
        if (p === scanPath) {
          return [
            { name: 'proj1', isDirectory: () => true },
            { name: 'bin', isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false }
          ];
        }
        return [];
      });

      const projects = await geminiService.discoverProjects([scanPath]);
      expect(projects).toHaveLength(1);
      expect(projects[0].hash).toBe('proj1');
    });
  });

  describe('getProjectSessions', () => {
    test('should return sessions from valid project', async () => {
      const projectPath = '/path/to/proj1';
      const chatsPath = path.join(projectPath, 'chats');

      fsPromises.access.mockImplementation(async (p) => {
        if (p === chatsPath || p.endsWith('.json')) return Promise.resolve();
        return Promise.reject(new Error('ENOENT'));
      });

      fsPromises.readdir.mockResolvedValue(['session1.json']);

      const mockStat = {
        birthtime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02'),
        size: 100
      };
      fsPromises.stat.mockResolvedValue(mockStat);

      const mockSessionContent = JSON.stringify({
        messages: [
          { type: 'user', content: 'hello' },
          { type: 'gemini', content: 'hi' }
        ]
      });
      fsPromises.readFile.mockResolvedValue(mockSessionContent);

      const sessions = await geminiService.getProjectSessions(projectPath);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toContain('session1');
      expect(sessions[0].messageCount).toBe(2);
    });

    test('should handle empty chats directory', async () => {
      const projectPath = '/path/to/proj1';

      fsPromises.access.mockResolvedValue(undefined);
      fsPromises.readdir.mockResolvedValue([]);

      const sessions = await geminiService.getProjectSessions(projectPath);
      expect(sessions).toHaveLength(0);
    });
  });
});
