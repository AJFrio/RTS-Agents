jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  setOpenCodeSessions: jest.fn(),
  getOpenCodeSessions: jest.fn(() => []),
}));

jest.mock('../../src/main/services/project-service', () => ({}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

jest.mock('../../src/main/services/acp-service', () =>
  require('./helpers/mock-acp-connect').acpConnectMockExports()
);

const pathExists = jest.fn();
jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists,
  pathExistsAny: jest.fn(),
}));

jest.mock('../../src/main/utils/install-status', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}));

const { spawn, spawnSync } = require('child_process');
const acpService = require('../../src/main/services/acp-service');
const configStore = require('../../src/main/services/config-store');
const opencodeService = require('../../src/main/services/opencode-service');
const { expectSpawnedCli, platformCli } = require('./helpers/cli-spawn-assert');
const { mockAcpConnect, flushPromises } = require('./helpers/mock-acp-connect');

describe('OpenCodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spawnSync.mockReturnValue({ status: 0 });
    opencodeService.setTrackedSessions([]);
  });

  test('buildRunArgs uses non-interactive run with project dir and json format', () => {
    const args = opencodeService.buildRunArgs('D:\\GitHub\\MyRepo', 'Fix the bug');
    expect(args[0]).toBe('run');
    expect(args).toContain('--dir');
    expect(args).toContain('--format');
    expect(args).toContain('json');
    expect(args).toContain('D:\\GitHub\\MyRepo');
    expect(args).toContain('--dangerously-skip-permissions');
    expect(args[args.length - 1]).toBe('Fix the bug');
  });

  test('buildRunArgs can omit auto-approve flag', () => {
    const args = opencodeService.buildRunArgs('/repo', 'task', { skipPermissions: false });
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  describe('ACP dispatch', () => {
    function mockAcp(overrides = {}) {
      mockAcpConnect(acpService, {
        sessionId: 'ses_acp1',
        acpSessionId: 'ses_acp1',
        onPrompt: overrides.onPrompt || overrides.onRun,
        promptPromise: overrides.promise,
        connectReject: overrides.connectReject,
        fireSessionId: overrides.fireSessionId,
      });
    }

    test('startSession dispatches via ACP and streams agent chunks', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp({
        onPrompt: ({ onUpdate }) => {
          onUpdate(
            { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Live output' } },
            'ses_acp1'
          );
        },
      });

      const result = await opencodeService.startSession({
        prompt: 'Fix the bug',
        projectPath: '/repo',
      });
      await flushPromises();

      expect(acpService.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          command: platformCli('opencode'),
          args: ['acp'],
          cwd: '/repo',
          permissionPolicy: 'allow-all',
        })
      );
      expect(result.message).toContain('ACP');
      expect(result.opencodeSessionId).toBe('ses_acp1');

      const tracked = opencodeService.getTrackedSessions();
      expect(tracked[0]).toMatchObject({
        status: 'completed',
        opencodeSessionId: 'ses_acp1',
        exitCode: 0,
      });
      expect(tracked[0].streamMessages).toEqual([
        expect.objectContaining({ content: 'Live output' }),
      ]);
      expect(configStore.setOpenCodeSessions).toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    test('falls back to legacy run when ACP fails before any agent work', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp({
        connectReject: Object.assign(new Error('ACP adapter exited (code 1)'), {
          phase: 'exit',
          fallbackAllowed: true,
        }),
      });
      spawnSync.mockReturnValue({ status: 0 });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn(), stdout: null, stderr: null });

      const result = await opencodeService.startSession({
        prompt: 'Fix the bug',
        projectPath: '/repo',
      });

      expectSpawnedCli(
        spawn,
        platformCli('opencode'),
        [
          'run',
          '--dir',
          '/repo',
          '--format',
          'json',
          '--dangerously-skip-permissions',
          'Fix the bug',
        ],
        expect.objectContaining({ cwd: '/repo', detached: true, shell: false })
      );
      expect(result.message).toContain('opencode run');
      expect(opencodeService.getTrackedSessions()).toHaveLength(1);
    });

    test('marks the session failed when ACP fails after start', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp({
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await opencodeService.startSession({ prompt: 'Fix the bug', projectPath: '/repo' });
      await flushPromises();

      const tracked = opencodeService.getTrackedSessions();
      expect(tracked[0]).toMatchObject({
        status: 'failed',
        opencodeSessionId: 'ses_acp1',
        error: 'ACP adapter exited (code 1)',
      });
      expect(spawn).not.toHaveBeenCalled();
    });

    test('persists stream messages with debounce while running', async () => {
      jest.useFakeTimers();
      try {
        pathExists.mockResolvedValue(true);
        mockAcp({
          promise: new Promise(() => {}),
        });

        const startPromise = opencodeService.startSession({
          prompt: 'Long task',
          projectPath: '/repo',
        });
        await Promise.resolve();
        await Promise.resolve();
        const captured = acpService._lastConnectOpts;
        captured.onUpdate(
          { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'live' } },
          'ses_acp1'
        );

        jest.advanceTimersByTime(1100);
        const persisted = configStore.setOpenCodeSessions.mock.calls.at(-1)[0];
        expect(persisted[0].streamMessages).toEqual([
          expect.objectContaining({ content: 'live' }),
        ]);
        expect(persisted[0].status).toBe('running');
        await startPromise;
      } finally {
        jest.useRealTimers();
      }
    });

    test('uses legacy run when a custom CLI command is provided', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp();
      spawnSync.mockReturnValue({ status: 0 });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn(), stdout: null, stderr: null });

      await opencodeService.startSession({
        prompt: 'Fix the bug',
        projectPath: '/repo',
        command: 'custom-opencode',
      });

      expect(acpService.connect).not.toHaveBeenCalled();
      expectSpawnedCli(
        spawn,
        'custom-opencode',
        [
          'run',
          '--dir',
          '/repo',
          '--format',
          'json',
          '--dangerously-skip-permissions',
          'Fix the bug',
        ],
        expect.objectContaining({ detached: true, shell: false })
      );
    });

    test('getSessionDetails uses stream messages and does not spawn export', async () => {
      opencodeService.setTrackedSessions([
        {
          id: 'opencode-1',
          prompt: 'Fix the bug',
          projectPath: '/repo',
          status: 'completed',
          streamMessages: [{ role: 'assistant', content: 'done' }],
          opencodeSessionId: 'ses_abc',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const details = await opencodeService.getSessionDetails('opencode-1');
      expect(details.status).toBe('completed');
      expect(details.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ content: 'done' })])
      );
      expect(spawn).not.toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['export']),
        expect.anything()
      );
    });

    test('setTrackedSessions marks orphan running sessions completed', () => {
      acpService.hasLiveSession.mockReturnValue(false);
      opencodeService.setTrackedSessions([
        {
          id: 'opencode-old',
          status: 'running',
          prompt: 'x',
          streamMessages: [],
        },
      ]);
      expect(opencodeService.getTrackedSessions()[0].status).toBe('completed');
      expect(configStore.setOpenCodeSessions).toHaveBeenCalled();
    });

    test('getAllAgents reconciles a live session with no in-flight prompt', () => {
      acpService.hasLiveSession.mockReturnValue(true);
      acpService.isPromptInProgress.mockReturnValue(false);
      opencodeService.setTrackedSessions([
        {
          id: 'opencode-1',
          status: 'running',
          prompt: 'x',
          streamMessages: [{ role: 'assistant', content: 'done' }],
        },
      ]);
      expect(opencodeService.getTrackedSessions()[0].status).toBe('running');
      const agents = opencodeService.getAllAgents();
      expect(agents[0].status).toBe('completed');
    });

    test('sendFollowUp accepts a follow-up on a live ACP session', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp();
      acpService.hasLiveSession.mockReturnValue(true);
      acpService.canFollowUp.mockReturnValue(true);
      acpService.promptFollowUp.mockImplementation(async (_id, _text, { onAccepted }) => {
        onAccepted?.();
        return { sessionId: 'ses_acp1', stopReason: 'end_turn' };
      });

      await opencodeService.startSession({ prompt: 'Fix the bug', projectPath: '/repo' });
      await Promise.resolve();
      await Promise.resolve();
      const id = opencodeService.getTrackedSessions()[0].id;
      const result = await opencodeService.sendFollowUp(id, 'Also run tests');
      expect(result.success).toBe(true);
      expect(acpService.promptFollowUp).toHaveBeenCalled();
    });
  });
});
