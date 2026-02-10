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

  describe('Activity mapping', () => {
    test('getActivityType returns correct type for all event kinds', () => {
      expect(julesService.getActivityType({ planGenerated: {} })).toBe('plan_generated');
      expect(julesService.getActivityType({ planApproved: {} })).toBe('plan_approved');
      expect(julesService.getActivityType({ userMessaged: { userMessage: 'Hi' } })).toBe('user_messaged');
      expect(julesService.getActivityType({ agentMessaged: { agentMessage: 'Hello' } })).toBe('agent_messaged');
      expect(julesService.getActivityType({ progressUpdated: { title: 'x' } })).toBe('progress');
      expect(julesService.getActivityType({ sessionCompleted: {} })).toBe('completed');
      expect(julesService.getActivityType({ sessionFailed: { reason: 'err' } })).toBe('session_failed');
      expect(julesService.getActivityType({})).toBe('unknown');
    });

    test('getAgentDetails maps activities with type, title, message, and planSteps', async () => {
      julesService.setApiKey('test-key');

      const https = require('https');
      https.request.mockImplementation((options, cb) => {
        const path = options.path || '';
        let data;
        if (path.includes('/activities')) {
          data = JSON.stringify({
            activities: [
              {
                id: 'a1',
                createTime: '2024-01-15T10:00:00Z',
                originator: 'user',
                userMessaged: { userMessage: 'Please add tests' }
              },
              {
                id: 'a2',
                createTime: '2024-01-15T10:01:00Z',
                originator: 'agent',
                agentMessaged: { agentMessage: 'I will add unit tests.' }
              },
              {
                id: 'a3',
                createTime: '2024-01-15T10:02:00Z',
                originator: 'system',
                sessionFailed: { reason: 'Unable to install dependencies' }
              },
              {
                id: 'a4',
                createTime: '2024-01-15T10:03:00Z',
                originator: 'agent',
                planGenerated: {
                  plan: {
                    id: 'plan1',
                    steps: [
                      { id: 's1', index: 0, title: 'Analyze code', description: 'Review structure' },
                      { id: 's2', index: 1, title: 'Write tests', description: 'Add coverage' }
                    ],
                    createTime: '2024-01-15T10:03:00Z'
                  }
                }
              }
            ]
          });
        } else {
          data = JSON.stringify({
            id: 'sess1',
            state: 'FAILED',
            title: 'Test Session',
            prompt: 'Task',
            sourceContext: { source: 'sources/github/o/r' }
          });
        }
        const mockRes = {
          statusCode: 200,
          on: (event, handler) => {
            if (event === 'data') handler(data);
            if (event === 'end') handler();
          }
        };
        setImmediate(() => cb(mockRes));
        return httpsRequestMock;
      });

      const result = await julesService.getAgentDetails('sess1');

      expect(result.activities).toHaveLength(4);

      const userMsg = result.activities.find((a) => a.type === 'user_messaged');
      expect(userMsg).toBeDefined();
      expect(userMsg.title).toBe('User message');
      expect(userMsg.message).toBe('Please add tests');

      const agentMsg = result.activities.find((a) => a.type === 'agent_messaged');
      expect(agentMsg).toBeDefined();
      expect(agentMsg.title).toBe('Agent message');
      expect(agentMsg.message).toBe('I will add unit tests.');

      const failed = result.activities.find((a) => a.type === 'session_failed');
      expect(failed).toBeDefined();
      expect(failed.title).toBe('Session failed');
      expect(failed.message).toBe('Unable to install dependencies');

      const planGen = result.activities.find((a) => a.type === 'plan_generated');
      expect(planGen).toBeDefined();
      expect(planGen.title).toBe('Analyze code');
      expect(planGen.planSteps).toEqual([
        { title: 'Analyze code', description: 'Review structure' },
        { title: 'Write tests', description: 'Add coverage' }
      ]);
    });
  });
});
