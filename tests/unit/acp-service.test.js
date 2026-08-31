const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const acpService = require('../../src/main/services/acp-service');
const installStatus = require('../../src/main/utils/install-status');

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

  test('unknown providers resolve to null', () => {
    expect(acpService.resolveAdapter('antigravity')).toBeNull();
    expect(acpService.resolveAdapter('jules')).toBeNull();
  });

  test('detects the cursor agent binary (agent)', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cursor-'));
    fs.writeFileSync(path.join(binDir, 'agent'), '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(binDir, 'agent'), 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('cursor')).toBe('agent');
    } finally {
      process.env.PATH = originalPath;
      acpService.clearAdapterCache();
    }
  });

  test('falls back to the legacy cursor-agent binary name', () => {
    const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-cursor-legacy-'));
    fs.writeFileSync(path.join(binDir, 'cursor-agent'), '#!/bin/sh\nexit 0\n');
    fs.chmodSync(path.join(binDir, 'cursor-agent'), 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      expect(acpService.resolveAdapter('cursor')).toBe('cursor-agent');
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
    const binPath = path.join(binDir, 'claude-agent-acp');
    fs.writeFileSync(binPath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(binPath, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('claude')).toBe('claude-agent-acp');
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
    const binPath = path.join(binDir, 'codex-acp');
    fs.writeFileSync(binPath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(binPath, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    try {
      expect(acpService.resolveAdapter('codex')).toBe('codex-acp');
      // Remove the binary and clear PATH; cached result must survive.
      fs.unlinkSync(binPath);
      process.env.PATH = binDir;
      expect(acpService.resolveAdapter('codex')).toBe('codex-acp');
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

describe('acp-service openSession (multi-turn live sessions)', () => {
  test('sends several prompts over one session and keeps context alive', async () => {
    const updates = [];
    const session = await acpService.openSession(
      fixtureOptions('multi-turn', {
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );

    try {
      const first = await session.prompt('first question');
      const second = await session.prompt('second question');
      const third = await session.prompt('third question');

      expect(first.stopReason).toBe('end_turn');
      expect(second.stopReason).toBe('end_turn');
      expect(third.stopReason).toBe('end_turn');

      // Same adapter process throughout: the turn counter keeps incrementing.
      expect(updates).toContain('turn:1:first question');
      expect(updates).toContain('turn:2:second question');
      expect(updates).toContain('turn:3:third question');

      expect(session.sessionId).toMatch(/^ses-fake-\d+-1$/);
      expect(session.isAlive()).toBe(true);
    } finally {
      session.dispose();
    }
  }, 15000);

  test('does not kill the adapter between turns, and does on dispose', async () => {
    const exitFile = path.join(
      os.tmpdir(),
      `acp-session-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    const session = await acpService.openSession(
      fixtureOptions('multi-turn', { env: { FAKE_ACP_EXIT_FILE: exitFile } })
    );

    await session.prompt('still here?');

    // The adapter must still be running after a completed turn.
    expect(fs.existsSync(exitFile)).toBe(false);
    expect(session.isAlive()).toBe(true);

    session.dispose();

    expect(await waitForFile(exitFile, 5000)).toBe(true);
    expect(session.isAlive()).toBe(false);
    fs.unlinkSync(exitFile);
  }, 15000);

  test('reports adapter capabilities from initialize', async () => {
    const session = await acpService.openSession(fixtureOptions('multi-turn'));
    try {
      // The fake adapter advertises no loadSession support.
      expect(session.capabilities).toBeDefined();
      expect(session.canLoadSession).toBe(false);
    } finally {
      session.dispose();
    }
  }, 10000);

  test('rejects a prompt sent after dispose without hanging', async () => {
    const session = await acpService.openSession(fixtureOptions('multi-turn'));
    await session.prompt('one');
    session.dispose();

    await expect(session.prompt('two')).rejects.toMatchObject({ phase: 'disposed' });
  }, 10000);

  test('rejects concurrent prompts on the same session', async () => {
    const session = await acpService.openSession(fixtureOptions('multi-turn'));
    try {
      const inflight = session.prompt('first');
      await expect(session.prompt('overlapping')).rejects.toMatchObject({ phase: 'busy' });
      await inflight;
    } finally {
      session.dispose();
    }
  }, 10000);

  test('surfaces adapter death mid-session to the pending prompt', async () => {
    const session = await acpService.openSession(fixtureOptions('multi-turn'));
    await session.prompt('warm up');

    session.killForTest();

    await expect(session.prompt('after death')).rejects.toMatchObject({ phase: 'exit' });
    expect(session.isAlive()).toBe(false);
  }, 10000);

  test('runPrompt still resolves and still kills the adapter (one-shot contract)', async () => {
    const exitFile = path.join(
      os.tmpdir(),
      `acp-oneshot-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    const result = await acpService.runPrompt(
      fixtureOptions('happy', { env: { FAKE_ACP_EXIT_FILE: exitFile } })
    );

    expect(result.stopReason).toBe('end_turn');
    expect(await waitForFile(exitFile, 5000)).toBe(true);
    fs.unlinkSync(exitFile);
  }, 10000);
});

describe('acp-service session/load (resuming a prior conversation)', () => {
  test('advertises loadSession when the adapter supports it', async () => {
    const session = await acpService.openSession(fixtureOptions('loadable'));
    try {
      expect(session.canLoadSession).toBe(true);
    } finally {
      session.dispose();
    }
  }, 10000);

  test('loadSession replays prior history then accepts new turns', async () => {
    const updates = [];
    const session = await acpService.loadSession(
      fixtureOptions('loadable', {
        acpSessionId: 'ses-previous-run',
        onUpdate: (update) => updates.push(update.content?.text),
      })
    );

    try {
      // The spec requires history replay before the load response.
      expect(updates).toContain('history:one');
      expect(updates).toContain('history:two');
      expect(session.sessionId).toBe('ses-previous-run');

      const result = await session.prompt('continue where we left off');
      expect(result.stopReason).toBe('end_turn');
      expect(updates).toContain('turn:1:continue where we left off');
    } finally {
      session.dispose();
    }
  }, 15000);

  test('refuses to load when the adapter does not advertise the capability', async () => {
    await expect(
      acpService.loadSession(
        fixtureOptions('not-loadable', { acpSessionId: 'ses-previous-run' })
      )
    ).rejects.toMatchObject({ phase: 'load-unsupported', fallbackAllowed: true });
  }, 10000);

  test('requires an acpSessionId to load', async () => {
    await expect(
      acpService.loadSession(fixtureOptions('loadable'))
    ).rejects.toThrow(/acpSessionId/i);
  }, 10000);
});
