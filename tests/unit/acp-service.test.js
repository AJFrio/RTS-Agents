const fs = require('fs');
const os = require('os');
const path = require('path');

const acpService = require('../../src/main/services/acp-service');
const installStatus = require('../../src/main/utils/install-status');
const { platformBin } = require('../../src/main/utils/cli-spawn');

function writeRunnableBin(dir, name) {
  const binName = platformBin(name);
  const full = path.join(dir, binName);
  const content =
    process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n';
  fs.writeFileSync(full, content);
  if (process.platform !== 'win32') fs.chmodSync(full, 0o755);
  return { binName, full };
}

/** Isolate PATH to `binDir` while still resolving cmd.exe on Windows. */
function isolatedPath(binDir) {
  if (process.platform !== 'win32') return binDir;
  const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  return `${binDir}${path.delimiter}${system32}`;
}

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-acp-adapter.js');

function fixtureOptions(scenario, extra = {}) {
  const { env, ...rest } = extra;
  return {
    command: process.execPath,
    args: [FIXTURE],
    cwd: os.tmpdir(),
    prompt: 'Do the thing',
    env: { FAKE_ACP_SCENARIO: scenario, ...(env || {}) },
    initTimeoutMs: 3000,
    ...rest,
  };
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

afterEach(() => {
  acpService.closeAll();
});

describe('acp-service runPrompt (real fake-adapter child processes)', () => {
  test('happy path: initialize, session/new, prompt, updates, permission, stop reason', async () => {
    const updates = [];
    const sessionIds = [];

    const result = await acpService.runPrompt(
      fixtureOptions('happy', {
        onUpdate: (update, sessionId) => updates.push({ text: update.content?.text, sessionId }),
        onSessionId: (sessionId) => sessionIds.push(sessionId),
      })
    );

    expect(result.stopReason).toBe('end_turn');
    expect(result.sessionId).toMatch(/^ses-fake-\d+-1$/);
    expect(sessionIds).toEqual([result.sessionId]);

    const texts = updates.map((u) => u.text);
    expect(texts).toContain('permission:allow:allow');
    expect(texts).toContain('unknown-request:-32601');
    expect(texts).toContain('chunk-1');
    expect(texts).toContain('chunk-2');
    expect(updates.every((u) => u.sessionId === result.sessionId)).toBe(true);
  });

  test('handles CRLF framing', async () => {
    const result = await acpService.runPrompt(fixtureOptions('crlf'));
    expect(result.stopReason).toBe('end_turn');
  });

  test('ignores malformed stdout lines', async () => {
    const result = await acpService.runPrompt(fixtureOptions('malformed'));
    expect(result.stopReason).toBe('end_turn');
  });

  test('rejects on protocol version mismatch without fallback', async () => {
    await expect(acpService.runPrompt(fixtureOptions('version-mismatch'))).rejects.toMatchObject({
      phase: 'version',
      fallbackAllowed: true,
    });
    await expect(acpService.runPrompt(fixtureOptions('version-mismatch'))).rejects.toThrow(/v2 is draft/i);
  });

  test('rejects on initialize error response', async () => {
    await expect(acpService.runPrompt(fixtureOptions('error-response'))).rejects.toMatchObject({
      phase: 'initialize',
      fallbackAllowed: true,
    });
  });

  test('rejects on initialize timeout and kills the adapter', async () => {
    const exitFile = path.join(os.tmpdir(), `acp-exit-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    await expect(
      acpService.runPrompt(fixtureOptions('init-timeout', { initTimeoutMs: 300, env: { FAKE_ACP_EXIT_FILE: exitFile } }))
    ).rejects.toMatchObject({ phase: 'initialize', fallbackAllowed: true });

    expect(await waitForFile(exitFile, 3000)).toBe(true);
    fs.unlinkSync(exitFile);
  }, 10000);

  test('rejects when adapter exits mid-session; fallback allowed before prompt', async () => {
    await expect(acpService.runPrompt(fixtureOptions('exit-mid'))).rejects.toMatchObject({
      phase: 'exit',
      fallbackAllowed: true,
    });
  });

  test('answers with cancelled outcome when no allow option exists', async () => {
    const updates = [];
    const result = await acpService.runPrompt(
      fixtureOptions('permission-no-allow', {
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    expect(result.stopReason).toBe('end_turn');
    expect(updates).toContain('permission:cancelled:cancelled');
  });

  test('rejects with phase spawn when the command cannot run', async () => {
    await expect(
      acpService.runPrompt({
        command: 'definitely-not-a-real-acp-cmd-xyz',
        args: [],
        cwd: os.tmpdir(),
        prompt: 'nope',
        initTimeoutMs: 1000,
      })
    ).rejects.toMatchObject({ phase: 'spawn', fallbackAllowed: true });
  });
  test('kills the adapter after the prompt response', async () => {
    const exitFile = path.join(
      os.tmpdir(),
      `acp-kill-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    await acpService.runPrompt(fixtureOptions('happy', { env: { FAKE_ACP_EXIT_FILE: exitFile } }));

    expect(await waitForFile(exitFile, 5000)).toBe(true);
    fs.unlinkSync(exitFile);
  }, 10000);

  test('concurrent prompts get independent sessions', async () => {
    const [a, b] = await Promise.all([
      acpService.runPrompt(fixtureOptions('happy')),
      acpService.runPrompt(fixtureOptions('happy')),
    ]);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.stopReason).toBe('end_turn');
    expect(b.stopReason).toBe('end_turn');
  });
});

describe('acp-service resolveAdapter', () => {
  afterEach(() => {
    acpService.clearAdapterCache();
    installStatus.clearInstallStatusCache();
  });

  test('opencode is handled natively by its own service (null from registry)', () => {
    expect(acpService.resolveAdapter('opencode')).toBeNull();
  });

  test('lists dedicated adapters plus native acp/--acp candidates', () => {
    const claude = acpService.adapterCandidates('claude');
    expect(claude.some((c) => c.command.includes('claude-agent-acp'))).toBe(true);
    expect(claude.some((c) => c.args[0] === 'acp' || c.args[0] === '--acp')).toBe(true);
    expect(acpService.adapterCandidates('codex').some((c) => c.args[0] === 'acp')).toBe(true);
    expect(acpService.adapterCandidates('antigravity').length).toBeGreaterThan(0);
  });

  test('falls back to native claude acp when the dedicated adapter is missing', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-claude-native-'));
    const { binName } = writeRunnableBin(binDir, 'claude');

    const originalPath = process.env.PATH;
    process.env.PATH = isolatedPath(binDir);
    try {
      expect(acpService.resolveAdapter('claude')).toEqual({ command: binName, args: ['acp'] });
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('unknown providers resolve to null', () => {
    expect(acpService.resolveAdapter('jules')).toBeNull();
  });

  test('antigravity is absent when agy is not on PATH', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-agy-empty-'));
    const originalPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      expect(acpService.resolveAdapter('antigravity')).toBeNull();
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('detects the cursor agent binary (agent)', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cursor-'));
    const { binName } = writeRunnableBin(binDir, 'agent');

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('cursor')).toEqual({ command: binName, args: ['acp'] });
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('falls back to the legacy cursor-agent binary name', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cursor-legacy-'));
    const { binName } = writeRunnableBin(binDir, 'cursor-agent');

    const originalPath = process.env.PATH;
    process.env.PATH = isolatedPath(binDir);
    try {
      expect(acpService.resolveAdapter('cursor')).toEqual({
        command: binName,
        args: ['acp'],
      });
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('returns null for cursor when neither binary is installed', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cursor-empty-'));
    const originalPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      expect(acpService.resolveAdapter('cursor')).toBeNull();
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('detects an adapter present on PATH', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-path-'));
    const { binName } = writeRunnableBin(binDir, 'claude-agent-acp');

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('claude')).toEqual({
        command: binName,
        args: [],
      });
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('returns null when the adapter is not installed', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-empty-'));
    const originalPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      expect(acpService.resolveAdapter('claude')).toBeNull();
      expect(acpService.resolveAdapter('codex')).toBeNull();
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('caches probe results until cleared', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cache-'));
    const { binName, full } = writeRunnableBin(binDir, 'codex-acp');

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('codex')).toEqual({ command: binName, args: [] });
      // Remove the binary and clear PATH; cached result must survive.
      fs.unlinkSync(full);
      process.env.PATH = binDir;
      expect(acpService.resolveAdapter('codex')).toEqual({ command: binName, args: [] });
      acpService.clearAdapterCache();
      expect(acpService.resolveAdapter('codex')).toBeNull();
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test('safe-tools policy rejects kinds outside read/edit/execute', () => {
    const options = [
      { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ];
    expect(
      acpService.pickPermissionOption(
        { toolCall: { kind: 'delete' }, options },
        'safe-tools'
      )
    ).toEqual({ optionId: 'reject', name: 'Reject', kind: 'reject_once' });
    expect(
      acpService.pickPermissionOption(
        { toolCall: { kind: 'edit' }, options },
        'safe-tools'
      ).optionId
    ).toBe('allow');
    expect(acpService.pickPermissionOption({ toolCall: { kind: 'delete' }, options: [] }, 'safe-tools')).toBeNull();
  });
});

describe('acp-service spawn arg construction', () => {
  test('passes args through unchanged on POSIX', () => {
    expect(acpService.buildSpawnArgs('claude-agent-acp', ['--foo'])).toEqual({
      command: 'claude-agent-acp',
      args: ['--foo'],
    });
  });

  test('wraps .cmd shims for cmd.exe on win32', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      expect(acpService.buildSpawnArgs('claude-agent-acp.cmd', ['--foo'])).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'claude-agent-acp.cmd --foo'],
      });
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});

describe('acp-service model selection (session modes)', () => {
  test('sends session/set_mode when the requested model is offered', async () => {
    const updates = [];
    const result = await acpService.runPrompt(
      fixtureOptions('model-modes', {
        model: 'sonnet',
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    expect(result.stopReason).toBe('end_turn');
    expect(updates).toContain('mode:sonnet');
  });

  test('skips set_mode when the requested model is not offered', async () => {
    const updates = [];
    await acpService.runPrompt(
      fixtureOptions('model-modes', {
        model: 'opus',
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    expect(updates).toContain('mode:none');
  });

  test('skips set_mode when no model is requested', async () => {
    const updates = [];
    await acpService.runPrompt(
      fixtureOptions('model-modes', {
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    expect(updates).toContain('mode:none');
  });

  test('proceeds with the prompt when the adapter advertises no modes', async () => {
    const updates = [];
    const result = await acpService.runPrompt(
      fixtureOptions('happy', {
        model: 'sonnet',
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    expect(result.stopReason).toBe('end_turn');
    expect(updates).toContain('mode:none');
  });
});

describe('acp-service connect (multi-turn)', () => {
  test('keeps the adapter alive for a second prompt', async () => {
    const updates = [];
    const session = await acpService.connect(
      fixtureOptions('happy', {
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );
    const first = await session.prompt('first');
    const second = await session.prompt('second');
    expect(first.stopReason).toBe('end_turn');
    expect(second.stopReason).toBe('end_turn');
    expect(updates.filter((t) => t === 'chunk-1')).toHaveLength(2);
    expect(session.closed).toBe(false);
    session.close();
  }, 15000);

  test('runPrompt still kills the adapter after the prompt response', async () => {
    const exitFile = path.join(
      os.tmpdir(),
      `acp-kill-oneshot-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await acpService.runPrompt(fixtureOptions('happy', { env: { FAKE_ACP_EXIT_FILE: exitFile } }));
    expect(await waitForFile(exitFile, 5000)).toBe(true);
    fs.unlinkSync(exitFile);
  }, 10000);

  test('resumes via session/load when loadSessionId is set', async () => {
    const session = await acpService.connect({
      ...fixtureOptions('load-session'),
      loadSessionId: 'ses-saved-99',
    });
    expect(session.sessionId).toBe('ses-saved-99');
    expect(session.loadSession).toBe(true);
    const result = await session.prompt('continue');
    expect(result.stopReason).toBe('end_turn');
    session.close();
  }, 10000);

  test('queues a second prompt while the first turn is in flight', async () => {
    const accepted = [];
    const session = await acpService.connect(
      fixtureOptions('slow-prompt', { env: { FAKE_ACP_PROMPT_DELAY_MS: '250' } })
    );
    const first = session.prompt('one');
    const second = session.prompt('two', { onAccepted: () => accepted.push('two') });
    const [a, b] = await Promise.all([first, second]);
    expect(a.stopReason).toBe('end_turn');
    expect(b.stopReason).toBe('end_turn');
    expect(accepted).toEqual(['two']);
    session.close();
  }, 10000);

  test('registerSession + canFollowUp + promptFollowUp reuse a live session', async () => {
    const session = await acpService.connect(fixtureOptions('happy'));
    acpService.registerSession('task-1', session);
    expect(acpService.canFollowUp('task-1', {})).toBe(true);
    expect(acpService.canFollowUp('missing', {})).toBe(false);
    expect(acpService.canFollowUp('missing', { acpSessionId: 'ses-x', loadSession: true })).toBe(
      true
    );
    const result = await acpService.promptFollowUp('task-1', 'follow up', {
      onAccepted: () => {},
    });
    expect(result.stopReason).toBe('end_turn');
    acpService.closeAll();
    expect(acpService.hasLiveSession('task-1')).toBe(false);
  }, 15000);
});
