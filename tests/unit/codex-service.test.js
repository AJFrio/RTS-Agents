
jest.mock('fs', () => {
  return {
    existsSync: jest.fn(),
    readdirSync: jest.fn(),
    promises: {
      readdir: jest.fn(),
      stat: jest.fn(),
      access: jest.fn()
    }
  };
});

const codexService = require('../../src/main/services/codex-service');
const https = require('https');
const fs = require('fs');
const { EventEmitter } = require('events');

describe('Codex Service', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset internal state
    codexService.setApiKey('test-key');
    codexService.setTrackedThreads([]);

    // Mock HTTPS request
    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn((timeout, callback) => {})
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.headers = {};

    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Configuration', () => {
    test('request throws error without API key', async () => {
      codexService.setApiKey(null);
      await expect(codexService.request('/test')).rejects.toThrow('OpenAI API key not configured');
    });
  });

  describe('API Requests', () => {
    test('request handles successful response', async () => {
      const promise = codexService.request('/test');

      mockResponse.emit('data', JSON.stringify({ success: true }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual({ success: true });
    });

    test('request handles error response', async () => {
      mockResponse.statusCode = 400;
      const promise = codexService.request('/test');

      mockResponse.emit('data', JSON.stringify({ error: 'Bad Request' }));
      mockResponse.emit('end');

      await expect(promise).rejects.toThrow('OpenAI API error: 400');
    });

    test('request handles non-JSON response', async () => {
      const promise = codexService.request('/test');

      mockResponse.emit('data', 'Plain text response');
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toBe('Plain text response');
    });
  });

  describe('Threads & Messages', () => {
    test('createThread sends correct request and tracks thread', async () => {
      const promise = codexService.createThread({
        messages: [{ role: 'user', content: 'hello' }],
        metadata: { title: 'Test Thread' },
        title: 'Test Thread'
      });

      mockResponse.emit('data', JSON.stringify({ id: 'thread_123' }));
      mockResponse.emit('end');

      const result = await promise;
      expect(result).toEqual({ id: 'thread_123' });

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads',
          method: 'POST'
        }),
        expect.any(Function)
      );

      const tracked = codexService.getTrackedThreads();
      expect(tracked).toHaveLength(1);
      expect(tracked[0].id).toBe('thread_123');
      expect(tracked[0].title).toBe('Test Thread');
    });

    test('getThread sends correct request', async () => {
      const promise = codexService.getThread('thread_123');

      mockResponse.emit('data', JSON.stringify({ id: 'thread_123' }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads/thread_123',
          method: 'GET'
        }),
        expect.any(Function)
      );
    });

    test('listMessages sends correct request', async () => {
      const promise = codexService.listMessages('thread_123');

      mockResponse.emit('data', JSON.stringify({ data: [] }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads/thread_123/messages?limit=100',
          method: 'GET'
        }),
        expect.any(Function)
      );
    });

    test('createMessage sends correct request', async () => {
      const promise = codexService.createMessage('thread_123', 'hello');

      mockResponse.emit('data', JSON.stringify({ id: 'msg_123' }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads/thread_123/messages',
          method: 'POST'
        }),
        expect.any(Function)
      );

      expect(mockRequest.write).toHaveBeenCalledWith(JSON.stringify({
        role: 'user',
        content: 'hello'
      }));
    });
  });

  describe('Runs', () => {
    test('createRun sends correct request', async () => {
      const promise = codexService.createRun('thread_123');

      mockResponse.emit('data', JSON.stringify({ id: 'run_123' }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads/thread_123/runs',
          method: 'POST'
        }),
        expect.any(Function)
      );
    });

    test('listRuns sends correct request', async () => {
      const promise = codexService.listRuns('thread_123');

      mockResponse.emit('data', JSON.stringify({ data: [] }));
      mockResponse.emit('end');

      await promise;

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/v1/threads/thread_123/runs?limit=20',
          method: 'GET'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Agent Management', () => {
    test('getAllAgents aggregates data correctly', async () => {
      // Setup tracked threads
      codexService.setTrackedThreads([
        { id: 'thread_1', prompt: 'Task 1' },
        { id: 'thread_2', prompt: 'Task 2' }
      ]);

      requestSpy.mockImplementation((options, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};

        process.nextTick(() => {
          let data = '{}';
          if (options.path.includes('/threads/thread_1/runs')) {
            data = JSON.stringify({ data: [{ id: 'run_1', status: 'completed', created_at: 1000 }] });
          } else if (options.path.includes('/threads/thread_2/runs')) {
            data = JSON.stringify({ data: [{ id: 'run_2', status: 'in_progress', created_at: 2000 }] });
          } else if (options.path.includes('/threads/thread_1')) {
            data = JSON.stringify({ id: 'thread_1', created_at: 1000 });
          } else if (options.path.includes('/threads/thread_2')) {
            data = JSON.stringify({ id: 'thread_2', created_at: 2000 });
          }

          if (callback) callback(res);
          res.emit('data', data);
          res.emit('end');
        });

        return mockRequest;
      });

      const agents = await codexService.getAllAgents();

      expect(agents).toHaveLength(2);

      const agent1 = agents.find(a => a.rawId === 'thread_1');
      expect(agent1).toBeDefined();
      expect(agent1.status).toBe('completed');
      expect(agent1.prompt).toBe('Task 1');

      const agent2 = agents.find(a => a.rawId === 'thread_2');
      expect(agent2).toBeDefined();
      expect(agent2.status).toBe('running');
    });

    test('getAgentDetails fetches full details', async () => {
      // Setup tracking
      codexService.setTrackedThreads([{ id: 'thread_1', prompt: 'Task 1' }]);

      requestSpy.mockImplementation((options, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};

        process.nextTick(() => {
          let data = '{}';
          if (options.path.includes('/messages')) {
            data = JSON.stringify({
              data: [
                { id: 'msg_1', role: 'user', content: [{ type: 'text', text: { value: 'Hello' } }], created_at: 1000 }
              ]
            });
          } else if (options.path.includes('/runs')) {
            data = JSON.stringify({
              data: [
                { id: 'run_1', status: 'completed', created_at: 1000 }
              ]
            });
          } else if (options.path.includes('/threads/thread_1')) {
            data = JSON.stringify({ id: 'thread_1', created_at: 1000 });
          }

          if (callback) callback(res);
          res.emit('data', data);
          res.emit('end');
        });

        return mockRequest;
      });

      const details = await codexService.getAgentDetails('thread_1');

      expect(details.id).toBe('codex-thread_1');
      expect(details.messages).toHaveLength(1);
      expect(details.messages[0].content).toBe('Hello');
      expect(details.runs).toHaveLength(1);
      expect(details.runs[0].status).toBe('completed');
    });
  });

  describe('Local Repositories', () => {
    test('getAvailableLocalRepositories scans directories correctly', async () => {
      // Mock fs.promises
      fs.promises.access.mockImplementation(async (path) => {
        if (path === '/projects') return Promise.resolve();
        if (path === '/projects/repo1/.git') return Promise.resolve();
        // repo2 is a directory but has no .git folder
        if (path === '/projects/repo2/.git') return Promise.reject({ code: 'ENOENT' });
        return Promise.reject({ code: 'ENOENT' });
      });

      fs.promises.readdir.mockImplementation(async (path, options) => {
        if (path === '/projects') {
          return [
            { name: 'repo1', isDirectory: () => true },
            { name: 'repo2', isDirectory: () => true },
            { name: 'file.txt', isDirectory: () => false },
            { name: 'node_modules', isDirectory: () => true } // Should be skipped
          ];
        }
        return [];
      });

      const repos = await codexService.getAvailableLocalRepositories(['/projects']);

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo1');
    });
  });

  describe('Task Creation', () => {
    test('createTask creates thread and tracks it', async () => {
      // Mock createThread response
      const mockThread = { id: 'thread_new', created_at: 1000 };

      // We need to spy on createThread because it calls request internally
      // and we want to verify the orchestration logic
      const createThreadSpy = jest.spyOn(codexService, 'createThread')
        .mockResolvedValue(mockThread);

      const trackThreadSpy = jest.spyOn(codexService, 'trackThread');

      const result = await codexService.createTask({
        prompt: 'Do something',
        repository: '/path/to/repo'
      });

      expect(createThreadSpy).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Do something',
        repository: '/path/to/repo'
      }));

      expect(trackThreadSpy).toHaveBeenCalledWith('thread_new', expect.objectContaining({
        prompt: 'Do something'
      }));

      expect(result.id).toBe('codex-thread_new');
    });
  });
});
