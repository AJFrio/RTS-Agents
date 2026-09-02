jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  setCodexThreads: jest.fn(),
}));

jest.mock('../../src/main/services/acp-service', () =>
  require('./helpers/mock-acp-connect').acpConnectMockExports()
);

const pathExistsAny = jest.fn();
jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists: jest.fn(),
  pathExistsAny,
}));

const pathExists = require('../../src/main/utils/path-exists').pathExists;

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
const os = require('os');
const { EventEmitter } = require('events');
const { spawn, spawnSync } = require('child_process');
const { expectSpawnedCli, platformCli } = require('./helpers/cli-spawn-assert');
const { mockAcpConnect, flushPromises } = require('./helpers/mock-acp-connect');
const codexService = require('../../src/main/services/codex-service');
const acpService = require('../../src/main/services/acp-service');
const configStore = require('../../src/main/services/config-store');

describe('Codex Service', () => {
  let mockRequest;
  let mockResponse;
  let requestSpy;

  beforeEach(() => {
    jest.clearAllMocks();
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

  test('createTask requires the Codex CLI and a project path', async () => {
    pathExists.mockResolvedValue(false);
    spawnSync.mockReturnValue({ status: 1 });
    pathExistsAny.mockResolvedValue(false);

    await expect(codexService.createTask({ prompt: 'Do something' })).rejects.toThrow(
      'Codex CLI not installed'
    );
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
    pathExists.mockResolvedValue(true);

    const result = await codexService.startSession({
      prompt: 'Fix tests',
      projectPath: '/path/to/repo',
    });

    expectSpawnedCli(
      spawn,
      platformCli('codex'),
      ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
      expect.objectContaining({
        cwd: '/path/to/repo',
        detached: true,
        shell: false,
      })
    );
    expect(result.message).toBe('Codex CLI task started in the background.');
  });

  describe('ACP dispatch', () => {
    function mockAcp(overrides = {}) {
      mockAcpConnect(acpService, {
        resolveAdapter: 'codex-acp',
        onPrompt: overrides.onPrompt || overrides.onRun,
        promptPromise: overrides.promise,
        connectReject: overrides.connectReject,
        fireSessionId: overrides.fireSessionId,
      });
    }

    describe('install detection', () => {
      test('bare ~/.codex without CLI or session data is NOT installed', async () => {
        spawnSync.mockReturnValue({ status: 1 });
        pathExistsAny.mockResolvedValue(false);

        expect(await codexService.refreshInstallStatus()).toBe(false);
        expect(pathExistsAny).toHaveBeenCalledWith([
          expect.stringContaining('.codex'),
          expect.stringContaining('.codex'),
          expect.stringContaining('.codex'),
        ]);
      });

      test('real codex data dir counts as installed', async () => {
        spawnSync.mockReturnValue({ status: 1 });
        pathExistsAny.mockResolvedValue(true);

        expect(await codexService.refreshInstallStatus()).toBe(true);
      });

      test('runnable codex CLI counts as installed', async () => {
        spawnSync.mockReturnValue({ status: 0 });

        expect(await codexService.refreshInstallStatus()).toBe(true);
      });
    });

    test('startSession dispatches via ACP, streams chunks, and completes', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      pathExists.mockResolvedValue(true);
      mockAcp({
        onPrompt: ({ onUpdate }) => {
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
      await flushPromises();

      expect(acpService.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'codex-acp',
          cwd: '/path/to/repo',
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
      pathExists.mockResolvedValue(true);
      mockAcp({
        connectReject: Object.assign(new Error('Failed to start ACP adapter'), {
          phase: 'spawn',
          fallbackAllowed: true,
        }),
      });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      const result = await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
      });

      expectSpawnedCli(
        spawn,
        platformCli('codex'),
        ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
        expect.objectContaining({ cwd: '/path/to/repo', detached: true, shell: false })
      );
      expect(result.message).toBe('Codex CLI task started in the background.');
      expect(codexService.getTrackedThreads()[0].status).toBe('running');
    });

    test('marks the thread failed when ACP fails after start', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      pathExists.mockResolvedValue(true);
      mockAcp({
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await codexService.startSession({ prompt: 'Fix tests', projectPath: '/path/to/repo' });
      await flushPromises();

      const threads = codexService.getTrackedThreads();
      expect(threads[0]).toMatchObject({
        status: 'failed',
        error: 'ACP adapter exited (code 1)',
      });
      expect(spawn).not.toHaveBeenCalled();
    });

    test('uses legacy spawn when a custom CLI command is provided', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      pathExists.mockResolvedValue(true);
      mockAcp();
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
        command: 'custom-codex',
      });

      expect(acpService.connect).not.toHaveBeenCalled();
      expectSpawnedCli(
        spawn,
        'custom-codex',
        ['exec', '--sandbox', 'workspace-write', 'Fix tests'],
        expect.objectContaining({ detached: true, shell: false })
      );
    });
  });

  describe('model selection', () => {
    test('legacy spawn includes --model when options.model is set', async () => {
      pathExists.mockResolvedValue(true);
      acpService.resolveAdapter.mockReturnValue(null);
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
        model: 'gpt-5.2-codex',
      });

      expectSpawnedCli(
        spawn,
        platformCli('codex'),
        ['exec', '--sandbox', 'workspace-write', '--model', 'gpt-5.2-codex', 'Fix tests'],
        expect.objectContaining({ detached: true, shell: false })
      );
    });

    test('legacy spawn omits --model when options.model is absent', async () => {
      pathExists.mockResolvedValue(true);
      acpService.resolveAdapter.mockReturnValue(null);
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

      await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
      });

      expectSpawnedCli(
        spawn,
        platformCli('codex'),
        ['exec', '--sandbox', 'workspace-write', 'Fix tests']
      );
    });

    test('ACP dispatch forwards the requested model to connect', async () => {
      pathExists.mockResolvedValue(true);
      mockAcpConnect(acpService, { resolveAdapter: 'codex-acp' });

      await codexService.startSession({
        prompt: 'Fix tests',
        projectPath: '/path/to/repo',
        model: 'gpt-5.2-codex',
      });

      expect(acpService.connect).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-5.2-codex' })
      );
    });

    test('sendFollowUp accepts a follow-up on a live ACP thread', async () => {
      pathExists.mockResolvedValue(true);
      mockAcpConnect(acpService, { resolveAdapter: 'codex-acp' });
      acpService.hasLiveSession.mockReturnValue(true);
      acpService.canFollowUp.mockReturnValue(true);
      acpService.promptFollowUp.mockImplementation(async (_id, _text, { onAccepted }) => {
        onAccepted?.();
        return { sessionId: 'acp-1', stopReason: 'end_turn' };
      });

      await codexService.startSession({ prompt: 'Fix tests', projectPath: '/path/to/repo' });
      await Promise.resolve();
      await Promise.resolve();
      const id = codexService.getTrackedThreads()[0].id;
      const result = await codexService.sendFollowUp(id, 'Also add tests');
      expect(result.success).toBe(true);
      expect(acpService.promptFollowUp).toHaveBeenCalled();
    });
  });
});
