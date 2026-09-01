const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildSpawnArgs,
  isCommandRunnable,
  platformBin,
  quoteWinArg,
  resolveWinExecutable,
  spawnCliSync,
  toAdapterSpec,
} = require('../../src/main/utils/cli-spawn');

describe('cli-spawn', () => {
  describe('quoteWinArg', () => {
    test('leaves simple tokens unquoted', () => {
      expect(quoteWinArg('opencode.cmd')).toBe('opencode.cmd');
    });

    test('quotes values with spaces', () => {
      expect(quoteWinArg('C:\\Program Files\\bin')).toBe('"C:\\Program Files\\bin"');
    });

    test('escapes embedded quotes', () => {
      expect(quoteWinArg('say "hi"')).toBe('"say \\"hi\\""');
    });
  });

  describe('buildSpawnArgs', () => {
    test('passes args through unchanged on POSIX', () => {
      expect(buildSpawnArgs('claude', ['-p', 'hello'])).toEqual({
        command: 'claude',
        args: ['-p', 'hello'],
      });
    });

    test('wraps .cmd shims for cmd.exe on win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        expect(buildSpawnArgs('opencode.cmd', ['run', 'Fix it'])).toEqual({
          command: 'cmd.exe',
          args: ['/d', '/s', '/c', 'opencode.cmd run "Fix it"'],
        });
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    test('wraps an extensionless name that resolves to a .cmd shim', () => {
      if (process.platform !== 'win32') return;
      const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-spawn-shim-'));
      fs.writeFileSync(path.join(binDir, 'mycli.cmd'), '@echo off\r\nexit /b 0\r\n');
      const originalPath = process.env.PATH;
      process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
      try {
        expect(resolveWinExecutable('mycli')).toMatch(/mycli\.cmd$/i);
        expect(buildSpawnArgs('mycli', ['--version'])).toEqual({
          command: 'cmd.exe',
          args: ['/d', '/s', '/c', 'mycli --version'],
        });
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });

  describe('isCommandRunnable', () => {
    test('detects the current node binary', () => {
      expect(isCommandRunnable(process.execPath, ['--version'])).toBe(true);
    });

    test('returns false for a missing command', () => {
      expect(isCommandRunnable('definitely-not-a-real-cli-xyz')).toBe(false);
    });

    test('spawnCliSync keeps shell: false', () => {
      const result = spawnCliSync(process.execPath, ['--version'], {
        stdio: 'ignore',
        timeout: 3000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    });
  });

  describe('toAdapterSpec', () => {
    test('returns null for missing adapters', () => {
      expect(toAdapterSpec(null)).toBeNull();
      expect(toAdapterSpec(undefined)).toBeNull();
    });

    test('wraps a string command with default args', () => {
      expect(toAdapterSpec('agent', ['acp'])).toEqual({ command: 'agent', args: ['acp'] });
    });

    test('passes through a spec object', () => {
      expect(toAdapterSpec({ command: 'claude', args: ['acp'] })).toEqual({
        command: 'claude',
        args: ['acp'],
      });
    });
  });

  describe('platformBin', () => {
    test('appends .cmd on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      try {
        expect(platformBin('claude')).toBe('claude.cmd');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
