const https = require('https');

// Mock external modules
jest.mock('https');

describe('JulesService', () => {
  let julesService;
  let httpsRequestMock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Mock https request
    httpsRequestMock = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      setTimeout: jest.fn(),
      destroy: jest.fn()
    };

    // Re-require https and setup mock
    const https = require('https');
    https.request.mockImplementation((options, cb) => {
      // Store the callback to invoke it later if needed
      https.request.callback = cb;
      return httpsRequestMock;
    });

    julesService = require('../../src/main/services/jules-service');
  });

  describe('Session Normalization', () => {
    test('normalizeSession maps status correctly', () => {
      const session = {
        id: '123',
        state: 'IN_PROGRESS'
      };

      const normalized = julesService.normalizeSession(session);
      expect(normalized.status).toBe('running');
    });

    test('normalizeSession detects completion via outputs', () => {
      const session = {
        id: '123',
        state: 'IN_PROGRESS', // Even if state says in progress
        outputs: [{ some: 'output' }]
      };

      const normalized = julesService.normalizeSession(session);
      expect(normalized.status).toBe('completed');
    });

    test('extractRepository finds github repo from source', () => {
      const session = {
        sourceContext: {
          source: 'sources/github/owner/repo'
        }
      };

      const repo = julesService.extractRepository(session);
      expect(repo).toBe('https://github.com/owner/repo');
    });

    test('extractPrUrl finds PR url in outputs', () => {
      const session = {
        outputs: [
          { pullRequest: { url: 'https://github.com/owner/repo/pull/1' } }
        ]
      };

      const prUrl = julesService.extractPrUrl(session);
      expect(prUrl).toBe('https://github.com/owner/repo/pull/1');
    });
  });

  describe('API Interaction', () => {
    test('listSources makes correct API call', async () => {
      julesService.setApiKey('test-key');

      const promise = julesService.listSources();

      // Simulate response
      const https = require('https');
      const mockRes = {
        statusCode: 200,
        on: (event, handler) => {
          if (event === 'data') handler(JSON.stringify({ sources: [] }));
          if (event === 'end') handler();
        }
      };
      https.request.callback(mockRes);

      await promise;

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('/sources'),
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-key'
          })
        }),
        expect.any(Function)
      );
    });

    test('createSession sends correct payload', async () => {
      julesService.setApiKey('test-key');

      const options = {
        prompt: 'test prompt',
        source: 'sources/github/owner/repo',
        branch: 'dev'
      };

      const promise = julesService.createSession(options);

      // Simulate response
      const https = require('https');
      const mockRes = {
        statusCode: 200,
        on: (event, handler) => {
          if (event === 'data') handler(JSON.stringify({ id: '123', state: 'QUEUED' }));
          if (event === 'end') handler();
        }
      };
      https.request.callback(mockRes);

      await promise;

      expect(httpsRequestMock.write).toHaveBeenCalledWith(
        expect.stringContaining('"prompt":"test prompt"')
      );
      expect(httpsRequestMock.write).toHaveBeenCalledWith(
        expect.stringContaining('"startingBranch":"dev"')
      );
      expect(httpsRequestMock.write).toHaveBeenCalledWith(
        expect.stringContaining('"automationMode":"AUTO_CREATE_PR"') // Default
      );
    });
  });
});
