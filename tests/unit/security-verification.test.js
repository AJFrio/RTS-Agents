const child_process = require('child_process');
const fs = require('fs');

// Create spy before requiring services
const spawnSpy = jest.spyOn(child_process, 'spawn').mockReturnValue({ unref: jest.fn(), on: jest.fn() });
const spawnSyncSpy = jest.spyOn(child_process, 'spawnSync').mockReturnValue({ status: 0 });

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
}));

// Require services AFTER mocking/spying
const claudeService = require('../../src/main/services/claude-service');
const geminiService = require('../../src/main/services/gemini-service');
const queueProcessorService = require('../../src/main/services/queue-processor-service');

describe('Security Verification - Command Injection', () => {
  beforeEach(() => {
    spawnSpy.mockClear();
    spawnSyncSpy.mockClear();
  });

  describe('ClaudeService', () => {
    it('should NOT use shell: true and NOT manually quote arguments in startLocalSession', async () => {
      const prompt = 'test prompt " with quotes';
      const projectPath = '/tmp/project';

      try {
        await claudeService.startLocalSession({ prompt, projectPath });
      } catch (e) {
        // We might get an error because we didn't mock everything, but we care about the spawn call
      }

      expect(spawnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['-p', prompt]),
        expect.objectContaining({
          shell: false
        })
      );

      // Verify no manual quoting of the prompt argument
      const call = spawnSpy.mock.calls.find(c => c[1].includes('-p'));
      if (call) {
        const promptArg = call[1][call[1].indexOf('-p') + 1];
        expect(promptArg).toBe(prompt);
        expect(promptArg).not.toMatch(/^".*"$/);
      }
    });
  });

  describe('GeminiService', () => {
    it('should NOT use shell: true and NOT manually quote arguments in startSession', async () => {
      const prompt = 'test prompt " with quotes';
      const projectPath = '/tmp/project';

      try {
        await geminiService.startSession({ prompt, projectPath });
      } catch (e) {}

      expect(spawnSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['-p', prompt]),
        expect.objectContaining({
          shell: false
        })
      );

      const call = spawnSpy.mock.calls.find(c => c[1].includes('-p'));
      if (call) {
        const promptArg = call[1][call[1].indexOf('-p') + 1];
        expect(promptArg).toBe(prompt);
        expect(promptArg).not.toMatch(/^".*"$/);
      }
    });
  });

  describe('QueueProcessorService', () => {
    it('should NOT use shell: true in isCommandRunnable', () => {
      queueProcessorService.isCommandRunnable('some-cmd');

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'some-cmd',
        ['--version'],
        expect.objectContaining({
          shell: false
        })
      );
    });
  });
});
