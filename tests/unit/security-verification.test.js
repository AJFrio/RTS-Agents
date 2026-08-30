const child_process = require('child_process');
const fs = require('fs');

// Create spy before requiring services
const spawnSpy = jest
  .spyOn(child_process, 'spawn')
  .mockReturnValue({ unref: jest.fn(), on: jest.fn() });
const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockReturnValue({ status: 0 });

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    ...jest.requireActual('fs').promises,
    access: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists: jest.fn().mockResolvedValue(true),
  pathExistsAny: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  setOpenCodeSessions: jest.fn(),
  getOpenCodeSessions: jest.fn(() => []),
}));

// The command-injection tests verify the legacy detached-CLI spawn args, so
// ACP dispatch (which spawns adapters without the prompt as an argv entry)
// must stay out of the way regardless of what is installed on the host.
jest.mock('../../src/main/services/acp-service', () => ({
  resolveAdapter: jest.fn(() => null),
  runPrompt: jest.fn(() =>
    Promise.reject(
      Object.assign(new Error('ACP disabled in security tests'), {
        phase: 'spawn',
        fallbackAllowed: true,
      })
    )
  ),
  clearAdapterCache: jest.fn(),
  pickPermissionOption: jest.fn(),
  buildSpawnArgs: jest.fn(),
}));

// Require services AFTER mocking/spying
let claudeService = require('../../src/main/services/claude-service');
let antigravityService = require('../../src/main/services/antigravity-service');
let queueProcessorService = require('../../src/main/services/queue-processor-service');
let opencodeService = require('../../src/main/services/opencode-service');

describe('Security Verification - Command Injection', () => {
  beforeEach(() => {
    jest.resetModules();
    spawnSpy.mockClear();
    spawnSyncSpy.mockClear();
    claudeService = require('../../src/main/services/claude-service');
    antigravityService = require('../../src/main/services/antigravity-service');
    queueProcessorService = require('../../src/main/services/queue-processor-service');
    opencodeService = require('../../src/main/services/opencode-service');
  });

  describe('ClaudeService', () => {
    it('should NOT use shell: true and NOT manually quote arguments in startLocalSession', async () => {
      const prompt = 'test prompt " with quotes';
      const projectPath = '/tmp/project';

      await claudeService.startLocalSession({ prompt, projectPath });

      expect(spawnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['-p', prompt]),
        expect.objectContaining({
          shell: false,
        })
      );

      // Verify no manual quoting of the prompt argument
      const call = spawnSpy.mock.calls.find((c) => c[1].includes('-p'));
      if (call) {
        const promptArg = call[1][call[1].indexOf('-p') + 1];
        expect(promptArg).toBe(prompt);
        expect(promptArg).not.toMatch(/^".*"$/);
      }
    });
  });

  describe('AntigravityService', () => {
    it('should NOT use shell: true and NOT manually quote arguments in startSession', async () => {
      const prompt = 'test prompt " with quotes';
      const projectPath = '/tmp/project';

      // Mock fsPromises.access to return resolved promise for projectPath
      const fsPromises = require('fs').promises;
      jest.spyOn(fsPromises, 'access').mockResolvedValue(undefined);

      try {
        await antigravityService.startSession({ prompt, projectPath });
      } catch (e) {
        console.error('startSession error:', e);
      }

      expect(spawnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--print', prompt]),
        expect.objectContaining({
          shell: false,
        })
      );

      const call = spawnSpy.mock.calls.find((c) => c[1].includes('--print'));
      if (call) {
        const promptArg = call[1][call[1].indexOf('--print') + 1];
        expect(promptArg).toBe(prompt);
        expect(promptArg).not.toMatch(/^".*"$/);
      }
    });
  });

  describe('OpenCodeService', () => {
    it('should NOT use shell: true when opening session in terminal', async () => {
      await opencodeService.openSessionInTerminal({
        projectPath: 'D:\\GitHub\\repo',
        opencodeSessionId: 'ses_abc123def456',
      });

      const terminalCall = spawnSpy.mock.calls.find(
        (call) =>
          call[0] === 'wt.exe' ||
          call[0] === 'cmd.exe' ||
          call[0] === 'x-terminal-emulator' ||
          call[0] === 'osascript'
      );
      expect(terminalCall).toBeDefined();
      expect(terminalCall[2].shell).toBe(false);
    });
  });

  describe('QueueProcessorService', () => {
    it('should NOT use shell: true in isCommandRunnable', () => {
      queueProcessorService.isCommandRunnable('some-cmd');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'some-cmd',
        ['--version'],
        expect.objectContaining({
          shell: false,
        })
      );
    });
  });
});
