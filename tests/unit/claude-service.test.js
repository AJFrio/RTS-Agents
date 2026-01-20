const path = require('path');

// Mock external modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));
jest.mock('https');
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/user'),
  platform: jest.fn().mockReturnValue('linux')
}));

describe('ClaudeService', () => {
  let claudeService;
  let fs;
  let https;
  let os;

  // Setup mocks
  const mockHomeDir = '/home/user';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Re-require modules to get fresh mocks/instances after resetModules
    fs = require('fs');
    https = require('https');
    os = require('os');

    // Reset os mock
    os.homedir.mockReturnValue(mockHomeDir);

    // Reset fs mocks
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync.mockReturnValue([]);
    fs.statSync.mockReturnValue({
      birthtime: new Date('2023-01-01'),
      mtime: new Date('2023-01-02'),
      size: 100
    });

    // Re-require service to get fresh instance/state
    claudeService = require('../../src/main/services/claude-service');
  });

  describe('Session Parsing Logic', () => {
    test('extractSessionName returns title if present', () => {
      const session = { title: 'My Custom Title' };
      expect(claudeService.extractSessionName(session)).toBe('My Custom Title');
    });

    test('extractSessionName falls back to user prompt', () => {
      const session = {
        messages: [
          { role: 'user', content: 'This is a long prompt that should be truncated because it is very long indeed' }
        ]
      };
      const name = claudeService.extractSessionName(session);
      expect(name).toContain('This is a long prompt');
      expect(name.endsWith('...')).toBe(true);
    });

    test('inferStatus detects running sessions based on mtime', () => {
      const now = new Date();
      fs.statSync.mockReturnValue({
        mtime: now // Just modified
      });

      const session = {};
      const stats = { mtime: now };

      expect(claudeService.inferStatus(session, stats)).toBe('running');
    });

    test('inferStatus detects completed sessions from status field', () => {
      const oldDate = new Date('2020-01-01');
      const stats = { mtime: oldDate };
      const session = { status: 'completed' };

      expect(claudeService.inferStatus(session, stats)).toBe('completed');
    });

    test('inferStatus defaults to completed for old sessions', () => {
      const oldDate = new Date('2020-01-01');
      const stats = { mtime: oldDate };
      const session = {};

      expect(claudeService.inferStatus(session, stats)).toBe('completed');
    });
  });

  describe('Project Discovery', () => {
    test('discoverProjects finds projects with sessions', async () => {
      const projectsDir = path.join(mockHomeDir, '.claude', 'projects');

      // Mock directory structure
      fs.existsSync.mockImplementation((p) => {
        if (p === projectsDir) return true;
        if (p.endsWith('my-project')) return true;
        if (p.endsWith('sessions')) return true;
        return false;
      });

      fs.readdirSync.mockImplementation((p, options) => {
        if (p === projectsDir) {
          return [{
            name: 'my-project',
            isDirectory: () => true
          }];
        }
        return [];
      });

      const projects = await claudeService.discoverProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].hash).toBe('my-project');
    });
  });

  describe('API Interaction', () => {
    test('createMessage makes HTTPS request', async () => {
      claudeService.setApiKey('test-api-key');

      const mockReq = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn()
      };

      https.request.mockImplementation((options, cb) => {
        const mockRes = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') handler(JSON.stringify({ content: [] }));
            if (event === 'end') handler();
          }
        };
        cb(mockRes);
        return mockReq;
      });

      await claudeService.createMessage([{ role: 'user', content: 'hi' }]);

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key'
          })
        }),
        expect.any(Function)
      );
    });

    test('createMessage throws if API key not set', async () => {
        claudeService.setApiKey(null);
        await expect(claudeService.createMessage([])).rejects.toThrow('Anthropic API key not configured');
    });
  });
});
