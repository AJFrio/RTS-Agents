const path = require('path');
const os = require('os');

// Define mock functions outside the factory so we can control them in tests
// NOTE: We rely on the fact that require() inside the factory will return these instances
// if we structure it correctly, OR we just use the factory to return new mocks and we
// don't use these specific variables inside the factory, but we need to control them.

// Correct Jest Pattern for Mocking Node Modules with custom behavior per test:
// 1. Use jest.mock with a factory.
// 2. In the factory, return an object where methods are jest.fn().
// 3. Since jest.mock is hoisted, we cannot close over variables declared in the file scope.
// 4. BUT, we can use `jest.requireActual` or just `require` if we are careful, but the standard way is:

// Option A: Use a variable prefixed with `mock`? No, that's for `jest.doMock`.
// Option B: Just let the factory create new mocks, and then "import" the mocked module in the test to control it.

jest.mock('fs', () => {
  return {
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    // We need to keep other fs methods if they are used, but we only use these.
  };
});

jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home'),
}));

// Now import the mocked module. This will be the object returned by the factory.
const fs = require('fs');
// const geminiService = require(...) should be after mocks.
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

      fs.existsSync.mockImplementation((p) => {
        if (p === scanPath) return true;
        if (p === path.join(scanPath, 'proj1')) return true;
        if (p === path.join(scanPath, 'proj1', 'chats')) return true;
        return false;
      });

      fs.readdirSync.mockImplementation((p) => {
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

      fs.existsSync.mockImplementation((p) => {
        if (p === chatsPath) return true;
        if (p.endsWith('.json')) return true;
        return false;
      });

      fs.readdirSync.mockReturnValue(['session1.json']);

      const mockStat = {
        birthtime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02'),
        size: 100
      };
      fs.statSync.mockReturnValue(mockStat);

      const mockSessionContent = JSON.stringify({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' }
        ]
      });
      fs.readFileSync.mockReturnValue(mockSessionContent);

      const sessions = await geminiService.getProjectSessions(projectPath);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toContain('session1');
      expect(sessions[0].messageCount).toBe(2);
    });

    test('should handle empty chats directory', async () => {
      const projectPath = '/path/to/proj1';

      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([]);

      const sessions = await geminiService.getProjectSessions(projectPath);
      expect(sessions).toHaveLength(0);
    });
  });
});
