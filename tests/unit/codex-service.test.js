jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  setCodexThreads: jest.fn(),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(),
  runPrompt: jest.fn(),
  clearAdapterCache: jest.fn(),
  pickPermissionOption: jest.fn(),
  buildSpawnArgs: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn(),
    access: jest.fn(),
  },
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

const https = require('https');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { spawn, spawnSync } = require('child_process');
const codexService = require('../../src/main/services/codex-service');
const acpService = require('../../src/main/services/acp-service');
const configStore = require('../../src/main/services/config-store');

describe('Codex Service', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    codexService.setApiKey('test-key');
    codexService.setTrackedThreads([]);

    mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      setTimeout: jest.fn(),
    };

    mockResponse = new EventEmitter();
    mockResponse.statusCode = 200;
    mockResponse.headers = { 'content-type': 'application/json' };

    requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      if (callback) {
        callback(mockResponse);
      }
      return mockRequest;
    });

    spawnSync.mockReturnValue({ status: 0 });
    spawn.mockReturnValue({
      on: jest.fn(),
      unref: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('request throws error without API key', async () => {
    codexService.setApiKey(null);
    await expect(codexService.request('/test')).rejects.toThrow('OpenAI API key not configured');
  });

  test('request handles successful response', async () => {
    const promise = codexService.request('/models');

    mockResponse.emit('data', JSON.stringify({ data: [] }));
    mockResponse.emit('end');

    await expect(promise).resolves.toEqual({ data: [] });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/models',
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
      expect.any(Function)
    );
  });

  test('request handles error response', async () => {
    mockResponse.statusCode = 400;
    const promise = codexService.request('/models');

    mockResponse.emit('data', JSON.stringify({ error: { message: 'Bad Request' } }));
    mockResponse.emit('end');

    await expect(promise).rejects.toThrow('OpenAI API error: 400');
  });

  test('testConnection returns provider health', async () => {
    const promise = codexService.testConnection();

    mockResponse.emit(
      'data',
      JSON.stringify({
        data: [{ id: 'gpt-5-codex' }, { id: 'gpt-5' }],
      })
    );
    mockResponse.emit('end');

    const result = await promise;
    expect(result).toMatchObject({
      provider: 'codex',
      success: true,
      connected: true,
      endpointLabel: 'GET /v1/models',
    });
    expect(result.diagnostics.codexModelCount).toBe(1);
  });

  test('createResponse sends Responses API payload and tracks the task', async () => {
    const promise = codexService.createResponse({
      prompt: 'Do something',
      repository: '/path/to/repo',
      branch: 'main',
      title: 'Test Response',
    });

    mockResponse.emit(
      'data',
      JSON.stringify({
        id: 'resp_123',
        status: 'completed',
        output_text: 'Done',
      })
    );
    mockResponse.emit('end');

    const result = await promise;
    expect(result.rawId).toBe('resp_123');
    expect(result.summary).toBe('Done');
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v1/responses',
        method: 'POST',
      }),
      expect.any(Function)
    );
    expect(JSON.parse(mockRequest.write.mock.calls[0][0])).toMatchObject({
      model: 'gpt-5-codex',
      input: expect.stringContaining('Do something'),
      store: true,
    });
    expect(codexService.getTrackedThreads()).toHaveLength(1);
  });

  test('getAgentDetails returns tracked response messages', async () => {
    codexService.trackThread('resp_1', {
      prompt: 'Task 1',
      responseText: 'Completed task',
      status: 'completed',
    });

    const details = await codexService.getAgentDetails('resp_1');
    expect(details.messages).toHaveLength(2);
    expect(details.messages[1].content).toBe('Completed task');
  });

  test('getAvailableLocalRepositories scans directories correctly', async () => {
    const projectsRoot = path.join(path.sep, 'projects');
    const repo1Git = path.join(projectsRoot, 'repo1', '.git');

    fs.promises.access.mockImplementation(async (targetPath) => {
      if (targetPath === projectsRoot || targetPath === repo1Git) return Promise.resolve();
      return Promise.reject({ code: 'ENOENT' });
    });

    fs.promises.readdir.mockImplementation(async (dirPath) => {
      if (dirPath === projectsRoot) {
        return [
          { name: 'repo1', isDirectory: () => true },
          { name: 'repo2', isDirectory: () => true },
          { name: 'file.txt', isDirectory: () => false },
          { name: 'node_modules', isDirectory: () => true },
        ];
      }
      return [];
    });

    const repos = await codexService.getAvailableLocalRepositories([projectsRoot]);
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('repo1');
  });

  test('startSession launches codex exec in the project directory', async () => {
    fs.promises.access.mockResolvedValue(undefined);

    const result = await codexService.startSession({
      prompt: 'Fix tests',
      projectPath: '/path/to/repo',
    });

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('codex'),
      ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
      expect.objectContaining({
        cwd: '/path/to/repo',
        detached: true,
      })
    );
    expect(result.message).toBe('Codex CLI task started in the background.');
  });

  describe('ACP dispatch', () => {
    function mockAcp(overrides = {}) {
      acpService.resolveAdapter.mockReturnValue('codex-acp');
      acpService.runPrompt.mockImplementation(({ onSessionId, onUpdate }) => {
        if (overrides.onRun) overrides.onRun({ onSessionId, onUpdate });
        return overrides.promise || Promise.resolve({ sessionId: 'acp-1', stopReason: 'end_turn' });
      });
    }

    test('startSession dispatches via ACP, streams chunks, and completes', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcp({
        onRun: ({ onSessionId, onUpdate }) => {
          onSessionId('acp-1');
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } },
            'acp-1'
          );
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world' } },
            'acp-1'
          );
        },
      });

      const result = await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(acpService.runPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'codex-acp',
          cwd: '/path/to/repo',
          prompt: 'Fix tests',
          permissionPolicy: 'allow-all',
        })
      );
      expect(result.message).toContain('ACP');

      const threads = codexService.getTrackedThreads();
      expect(threads[0]).toMatchObject({
        status: 'completed',
        responseText: 'Hello world',
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
      });
      expect(configStore.setCodexThreads).toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    test('falls back to legacy spawn when ACP fails before any agent work', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcp({
        promise: Promise.reject(
          Object.assign(new Error('Failed to start ACP adapter'), {
            phase: 'spawn',
            fallbackAllowed: true,
          })
        ),
      });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      const result = await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('codex'),
        ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
        expect.objectContaining({ cwd: '/path/to/repo', detached: true })
      );
      expect(result.message).toBe('Codex CLI task started in the background.');
      expect(codexService.getTrackedThreads()[0].status).toBe('running');
    });

    test('marks the thread failed when ACP fails after start', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcp({
        onRun: ({ onSessionId }) => onSessionId('acp-1'),
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await codexService.startSession({ prompt: 'Fix tests', projectPath: '/path/to/repo' });

      const threads = codexService.getTrackedThreads();
      expect(threads[0]).toMatchObject({
        status: 'failed',
        error: 'ACP adapter exited (code 1)',
      });
      expect(spawn).not.toHaveBeenCalled();
    });

    test('uses legacy spawn when a custom CLI command is provided', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      mockAcp();
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
        command: 'custom-codex',
      });

      expect(acpService.runPrompt).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        'custom-codex',
        ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
        expect.objectContaining({ detached: true })
      );
    });
  });
});
