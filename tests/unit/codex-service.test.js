jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
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
});
