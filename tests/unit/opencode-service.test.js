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

jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(),
  runPrompt: jest.fn(),
  openSession: jest.fn(),
  loadSession: jest.fn(),
  clearAdapterCache: jest.fn(),
  pickPermissionOption: jest.fn(),
  buildSpawnArgs: jest.fn(),
}));

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

describe('OpenCodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      if (overrides.openError) {
        acpService.openSession.mockRejectedValue(overrides.openError);
        return;
      }
      acpService.openSession.mockImplementation(({ onSessionId, onUpdate }) => {
        const session = {
          sessionId: 'ses_acp1',
          capabilities: {},
          canLoadSession: false,
          isAlive: () => true,
          dispose: jest.fn(),
          prompt: jest.fn(() => {
            if (overrides.onRun) overrides.onRun({ onSessionId, onUpdate });
            return (
              overrides.promise ||
              Promise.resolve({ sessionId: 'ses_acp1', stopReason: 'end_turn' })
            );
          }),
        };
        if (overrides.onOpen) overrides.onOpen({ onSessionId, onUpdate });
        if (onSessionId) onSessionId('ses_acp1');
        return Promise.resolve(session);
      });
    }

    test('startSession dispatches via ACP and streams agent chunks', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp({
        onRun: ({ onSessionId, onUpdate }) => {
          onSessionId('ses_acp1');
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

      expect(acpService.openSession).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'opencode',
          args: ['acp'],
          cwd: '/repo',
          permissionPolicy: 'allow-all',
        })
      );
      const opened = await acpService.openSession.mock.results[0].value;
      expect(opened.prompt).toHaveBeenCalledWith('Fix the bug');
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
      acpService.openSession.mockRejectedValue(
        Object.assign(new Error('ACP adapter exited (code 1)'), {
          phase: 'exit',
          fallbackAllowed: true,
        })
      );
      spawnSync.mockReturnValue({ status: 0 });
      spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn(), stdout: null, stderr: null });

      const result = await opencodeService.startSession({
        prompt: 'Fix the bug',
        projectPath: '/repo',
      });

      expect(spawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run', '--dir', '/repo', 'Fix the bug']),
        expect.objectContaining({ cwd: '/repo', detached: true })
      );
      expect(result.message).toContain('opencode run');
      expect(opencodeService.getTrackedSessions()).toHaveLength(1);
    });

    test('marks the session failed when ACP fails after start', async () => {
      pathExists.mockResolvedValue(true);
      mockAcp({
        onRun: ({ onSessionId }) => onSessionId('ses_acp1'),
        promise: Promise.reject(
          Object.assign(new Error('ACP adapter exited (code 1)'), {
            phase: 'exit',
            fallbackAllowed: false,
          })
        ),
      });

      await opencodeService.startSession({ prompt: 'Fix the bug', projectPath: '/repo' });
      // Dispatch now has an extra hop (openSession -> prompt); let it settle.
      await new Promise((r) => setImmediate(r));

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
        let captured;
        mockAcp({
          promise: new Promise(() => {}),
          onRun: (handlers) => {
            captured = handlers;
          },
        });

        const startPromise = opencodeService.startSession({
          prompt: 'Long task',
          projectPath: '/repo',
        });
        await Promise.resolve();
        await Promise.resolve();
        captured.onSessionId('ses_acp1');
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

      expect(acpService.openSession).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledWith(
        'custom-opencode',
        expect.arrayContaining(['run', 'Fix the bug']),
        expect.objectContaining({ detached: true })
      );
    });
  });
});
