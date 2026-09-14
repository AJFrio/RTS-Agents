jest.mock('../../src/main/services/config-store', () => ({
  getSetting: jest.fn(() => ({})),
  getAntigravitySessions: jest.fn(() => []),
  setAntigravitySessions: jest.fn(),
}));

jest.mock('../../src/main/services/acp-service', () => ({
  ...require('./helpers/mock-acp-connect').acpConnectMockExports(),
  resolveAdapter: jest.fn(() => null),
  buildSpawnArgs: jest.fn((command, args) => ({ command, args })),
}));

jest.mock('../../src/main/services/project-service', () => ({}));

jest.mock('../../src/main/utils/path-exists', () => ({
  pathExists: jest.fn(),
  pathExistsAny: jest.fn(),
}));

jest.mock('../../src/main/utils/install-status', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
}));

jest.mock('../../src/main/services/provider-health', () => ({
  ok: jest.fn(),
  fail: jest.fn(),
}));

jest.mock('../../src/main/services/session-events', () => ({
  sessionEvents: { on: jest.fn(), emit: jest.fn(), setMaxListeners: jest.fn() },
  emitSessionUpdated: jest.fn(),
  emitTrackedSessionUpdate: jest.fn(),
}));

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn(),
}));

const { spawn } = require('child_process');
const { pathExists } = require('../../src/main/utils/path-exists');
const antigravityService = require('../../src/main/services/antigravity-service');
const acpService = require('../../src/main/services/acp-service');
const configStore = require('../../src/main/services/config-store');
const { mockAcpConnect } = require('./helpers/mock-acp-connect');
const { emitTrackedSessionUpdate } = require('../../src/main/services/session-events');

describe('AntigravityService model selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });
    antigravityService.setTrackedSessions([]);
  });

  test('startSession includes --model when options.model is set', async () => {
    pathExists.mockResolvedValue(true);

    await antigravityService.startSession({
      prompt: 'Reverse the string',
      projectPath: '/repo',
      model: 'gemini-3.7-flash-high',
    });

    expect(spawn).toHaveBeenCalledWith(
      'agy',
      [
        '--print',
        'Reverse the string',
        '--print-timeout',
        '30m',
        '--output-format',
        'stream-json',
        '--model',
        'gemini-3.7-flash-high',
      ],
      expect.objectContaining({ cwd: '/repo', detached: true })
    );
  });

  test('startSession omits --model when options.model is absent', async () => {
    pathExists.mockResolvedValue(true);

    await antigravityService.startSession({
      prompt: 'Reverse the string',
      projectPath: '/repo',
    });

    expect(spawn).toHaveBeenCalledWith(
      'agy',
      ['--print', 'Reverse the string', '--print-timeout', '30m', '--output-format', 'stream-json'],
      expect.anything()
    );
  });

  test('sendFollowUp accepts a follow-up on a live ACP session', async () => {
    pathExists.mockResolvedValue(true);
    mockAcpConnect(acpService, { resolveAdapter: { command: 'agy', args: ['acp'] } });
    acpService.hasLiveSession.mockReturnValue(true);
    acpService.canFollowUp.mockReturnValue(true);
    acpService.promptFollowUp.mockImplementation(async (_id, _text, { onAccepted }) => {
      onAccepted?.();
      return { sessionId: 'acp-1', stopReason: 'end_turn' };
    });

    await antigravityService.startSession({
      prompt: 'Reverse the string',
      projectPath: '/repo',
    });
    await Promise.resolve();
    await Promise.resolve();
    const id = antigravityService.getTrackedSessions()[0].id;
    const result = await antigravityService.sendFollowUp(id, 'Also add tests');
    expect(result.success).toBe(true);
    expect(acpService.promptFollowUp).toHaveBeenCalled();
  });
});

describe('AntigravityService session persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    antigravityService.setTrackedSessions([]);
  });

  test('persisted records round-trip conversationId, error, and streamMessages', () => {
    acpService.hasLiveSession.mockReturnValue(false);
    const record = {
      id: 'antigravity-rt',
      rawId: 'antigravity-rt',
      prompt: 'Stream it',
      projectPath: '/repo',
      status: 'running',
      filePath: null,
      acpSessionId: 'acp-1',
      loadSession: true,
      conversationId: '6a3c1f2e-9b4d-4c8a-a1e2-3f4d5c6b7a89',
      error: 'turn failed',
      streamMessages: [{ role: 'assistant', content: 'partial' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    antigravityService.setTrackedSessions([record]);
    const persisted = configStore.setAntigravitySessions.mock.calls.at(-1)[0];
    expect(persisted[0]).toMatchObject({
      conversationId: record.conversationId,
      error: record.error,
      streamMessages: record.streamMessages,
    });

    configStore.getAntigravitySessions.mockReturnValue(persisted);
    antigravityService.setTrackedSessions(configStore.getAntigravitySessions());
    expect(antigravityService.getTrackedSessions()[0]).toMatchObject({
      conversationId: record.conversationId,
      error: record.error,
      streamMessages: record.streamMessages,
    });
  });
});

describe('AntigravityService legacy stream-json dispatch', () => {
  const CONVERSATION_ID = '6a3c1f2e-9b4d-4c8a-a1e2-3f4d5c6b7a89';

  const makeStreamChild = () => {
    const handlers = {};
    const child = {
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
      }),
      unref: jest.fn(),
      stdout: {
        on: jest.fn((event, cb) => {
          handlers[`stdout:${event}`] = cb;
        }),
      },
      stderr: {
        on: jest.fn((event, cb) => {
          handlers[`stderr:${event}`] = cb;
        }),
      },
    };
    return { child, handlers };
  };

  const streamLine = (payload) => Buffer.from(`${JSON.stringify(payload)}\n`);

  const initLine = () => ({
    event: 'init',
    conversation_id: CONVERSATION_ID,
    init: {},
  });

  const deltaLine = (text, stepIndex) => ({
    event: 'step_update',
    step_update: {
      conversation_id: CONVERSATION_ID,
      step_index: stepIndex,
      state: 'ACTIVE',
      step_type: 'agent_response',
      text_delta: text,
    },
  });

  const resultLine = (status, extra = {}) => ({
    event: 'result',
    result: {
      conversation_id: CONVERSATION_ID,
      status,
      response: 'done',
      error: null,
      duration_seconds: 1,
      num_turns: 1,
      usage: {},
      ...extra,
    },
  });

  const startLegacySession = async ({ child }) => {
    spawn.mockReturnValue(child);
    pathExists.mockResolvedValue(true);
    await antigravityService.startSession({
      prompt: 'Stream it',
      projectPath: '/repo',
    });
    return antigravityService.getTrackedSessions()[0];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    acpService.resolveAdapter.mockImplementation(() => null);
    acpService.connect.mockReset();
    acpService.hasLiveSession.mockImplementation(() => false);
    acpService.canFollowUp.mockImplementation(() => false);
    spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });
    antigravityService.setTrackedSessions([]);
  });

  test('spawns agy with stream-json output and piped stdio', async () => {
    const { child } = makeStreamChild();
    await startLegacySession({ child });

    expect(spawn).toHaveBeenCalledWith(
      'agy',
      ['--print', 'Stream it', '--print-timeout', '30m', '--output-format', 'stream-json'],
      expect.objectContaining({
        cwd: '/repo',
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    );
    expect(child.unref).toHaveBeenCalled();
  });

  test('captures the conversation UUID from the init event', async () => {
    const { child, handlers } = makeStreamChild();
    const record = await startLegacySession({ child });

    handlers['stdout:data'](streamLine(initLine()));

    expect(antigravityService.getTrackedSessions()[0].conversationId).toBe(CONVERSATION_ID);
    const persisted = configStore.setAntigravitySessions.mock.calls.at(-1)[0];
    expect(persisted[0]).toMatchObject({ id: record.id, conversationId: CONVERSATION_ID });
  });

  test('coalesces agent_response deltas into one assistant message', async () => {
    const { child, handlers } = makeStreamChild();
    await startLegacySession({ child });

    handlers['stdout:data'](streamLine(deltaLine('Hello', 0)));
    handlers['stdout:data'](streamLine(deltaLine(' world', 1)));

    const record = antigravityService.getTrackedSessions()[0];
    expect(record.streamMessages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'Hello world' }),
    ]);
    expect(record.status).toBe('running');
  });

  test('finalizes completed on SUCCESS result and emits with statusChanged', async () => {
    const { child, handlers } = makeStreamChild();
    const record = await startLegacySession({ child });

    handlers['stdout:data'](streamLine(resultLine('SUCCESS')));

    expect(antigravityService.getTrackedSessions()[0]).toMatchObject({
      status: 'completed',
      error: null,
    });
    expect(emitTrackedSessionUpdate).toHaveBeenCalledWith(
      'antigravity',
      expect.objectContaining({ id: record.id, status: 'completed' }),
      expect.objectContaining({ statusChanged: true })
    );
  });

  test('marks the session failed when the child closes non-zero without a result', async () => {
    const { child, handlers } = makeStreamChild();
    await startLegacySession({ child });

    handlers['stderr:data'](Buffer.from('boom\n'));
    handlers.close(1);

    expect(antigravityService.getTrackedSessions()[0]).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
  });

  test('leaves a WAITING result running and finalizes on close', async () => {
    const { child, handlers } = makeStreamChild();
    await startLegacySession({ child });

    handlers['stdout:data'](streamLine(resultLine('WAITING')));
    expect(antigravityService.getTrackedSessions()[0].status).toBe('running');

    handlers.close(0);
    expect(antigravityService.getTrackedSessions()[0].status).toBe('completed');
  });

  test('debounces streaming emits while the session is running', async () => {
    jest.useFakeTimers();
    try {
      const { child, handlers } = makeStreamChild();
      spawn.mockReturnValue(child);
      pathExists.mockResolvedValue(true);
      const startPromise = antigravityService.startSession({
        prompt: 'Stream it',
        projectPath: '/repo',
      });
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(400);
      await startPromise;

      handlers['stdout:data'](streamLine(deltaLine('a', 0)));
      handlers['stdout:data'](streamLine(deltaLine('b', 1)));

      expect(emitTrackedSessionUpdate).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);

      expect(emitTrackedSessionUpdate).toHaveBeenCalledTimes(1);
      expect(emitTrackedSessionUpdate).toHaveBeenCalledWith(
        'antigravity',
        expect.objectContaining({ status: 'running' }),
        expect.objectContaining({ statusChanged: false })
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('AntigravityService openSessionInTerminal', () => {
  const UUID = '6a3c1f2e-9b4d-4c8a-a1e2-3f4d5c6b7a89';

  beforeEach(() => {
    jest.clearAllMocks();
    spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });
    pathExists.mockResolvedValue(true);
  });

  test('spawns agy --conversation <uuid> in a terminal with cwd set', async () => {
    const result = await antigravityService.openSessionInTerminal({
      projectPath: '/repo',
      conversationId: UUID,
    });

    expect(spawn).toHaveBeenCalledWith(
      'x-terminal-emulator',
      ['-e', 'agy', '--conversation', UUID],
      expect.objectContaining({ cwd: '/repo', detached: true, stdio: 'ignore', shell: false })
    );
    expect(result).toEqual({ success: true, method: 'x-terminal-emulator' });
  });

  test('falls back to -c when conversationId is null', async () => {
    await antigravityService.openSessionInTerminal({ projectPath: '/repo', conversationId: null });

    expect(spawn).toHaveBeenCalledWith(
      'x-terminal-emulator',
      ['-e', 'agy', '-c'],
      expect.objectContaining({ cwd: '/repo' })
    );
  });

  test('falls back to -c for non-UUID garbage conversationId', async () => {
    await antigravityService.openSessionInTerminal({
      projectPath: '/repo',
      conversationId: 'rm -rf /',
    });

    const call = spawn.mock.calls.find((c) => c[0] === 'x-terminal-emulator');
    expect(call).toBeDefined();
    expect(call[1]).toEqual(['-e', 'agy', '-c']);
    expect(call[1]).not.toContain('--conversation');
  });

  test('does not spawn when projectPath is missing', async () => {
    await expect(
      antigravityService.openSessionInTerminal({ projectPath: '', conversationId: UUID })
    ).rejects.toThrow('Project path is required');
    expect(spawn).not.toHaveBeenCalled();
  });

  test('does not spawn when projectPath does not exist', async () => {
    pathExists.mockResolvedValue(false);

    await expect(
      antigravityService.openSessionInTerminal({ projectPath: '/nope', conversationId: UUID })
    ).rejects.toThrow('does not exist');
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('AntigravityService legacy follow-up turns', () => {
  const CONVERSATION_ID = '6a3c1f2e-9b4d-4c8a-a1e2-3f4d5c6b7a89';

  const makeStreamChild = () => {
    const handlers = {};
    const child = {
      on: jest.fn((event, cb) => {
        handlers[event] = cb;
      }),
      unref: jest.fn(),
      stdout: {
        on: jest.fn((event, cb) => {
          handlers[`stdout:${event}`] = cb;
        }),
      },
      stderr: {
        on: jest.fn((event, cb) => {
          handlers[`stderr:${event}`] = cb;
        }),
      },
    };
    return { child, handlers };
  };

  const streamLine = (payload) => Buffer.from(`${JSON.stringify(payload)}\n`);

  const resultLine = (status) => ({
    event: 'result',
    result: {
      conversation_id: CONVERSATION_ID,
      status,
      response: 'done',
      error: null,
      duration_seconds: 1,
      num_turns: 2,
      usage: {},
    },
  });

  const seedRecord = (overrides = {}) => {
    const record = {
      id: 'antigravity-followup-1',
      rawId: 'antigravity-followup-1',
      prompt: 'First task',
      projectPath: '/repo',
      status: 'completed',
      streamMessages: [{ role: 'assistant', content: 'first answer', id: 'stream-0' }],
      error: null,
      conversationId: CONVERSATION_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
    antigravityService.setTrackedSessions([record]);
    return record;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    acpService.resolveAdapter.mockImplementation(() => null);
    acpService.hasLiveSession.mockImplementation(() => false);
    acpService.canFollowUp.mockImplementation(() => false);
    spawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });
    antigravityService.setTrackedSessions([]);
  });

  test('spawns a legacy followup with --conversation and appends the user message', async () => {
    seedRecord();
    const { child, handlers } = makeStreamChild();
    spawn.mockReturnValue(child);

    await antigravityService.sendFollowUp('antigravity-followup-1', 'ping');

    const spawnCall = spawn.mock.calls.at(-1);
    expect(spawnCall[0]).toBe('agy');
    expect(spawnCall[1]).toEqual(
      expect.arrayContaining([
        '--print',
        'ping',
        '--print-timeout',
        '30m',
        '--output-format',
        'stream-json',
        '--conversation',
        CONVERSATION_ID,
      ])
    );
    expect(spawnCall[2]).toEqual(
      expect.objectContaining({ cwd: '/repo', detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    );
    expect(child.unref).toHaveBeenCalled();

    const record = antigravityService.getTrackedSessions()[0];
    expect(record.status).toBe('running');
    expect(record.streamMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'ping' })])
    );

    handlers['stdout:data'](streamLine(resultLine('SUCCESS')));
    handlers.close(0);

    const finished = antigravityService.getTrackedSessions()[0];
    expect(finished.status).toBe('completed');
    expect(finished.error).toBeNull();
    expect(finished.conversationId).toBe(CONVERSATION_ID);
    expect(finished.streamMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'ping' })])
    );
  });

  test('rejects when a turn is already in progress and does not spawn', async () => {
    seedRecord();
    antigravityService.getTrackedSessions()[0].status = 'running';

    await expect(
      antigravityService.sendFollowUp('antigravity-followup-1', 'ping')
    ).rejects.toThrow('turn is already in progress');
    expect(spawn).not.toHaveBeenCalled();
  });

  test('rejects when the record has no valid conversationId and does not spawn', async () => {
    seedRecord({ conversationId: null });

    await expect(
      antigravityService.sendFollowUp('antigravity-followup-1', 'ping')
    ).rejects.toThrow(/conversation/i);
    expect(spawn).not.toHaveBeenCalled();
  });

  test('rejects for an unknown session id', async () => {
    await expect(antigravityService.sendFollowUp('nope', 'ping')).rejects.toThrow(
      'Task not found: nope'
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  test('still routes to the ACP helper when the session is ACP-live', async () => {
    seedRecord();
    mockAcpConnect(acpService, { resolveAdapter: { command: 'agy', args: ['acp'] } });
    acpService.hasLiveSession.mockReturnValue(true);
    acpService.canFollowUp.mockReturnValue(true);
    acpService.promptFollowUp.mockImplementation(async (_id, _text, { onAccepted }) => {
      onAccepted?.();
      return { sessionId: 'acp-1', stopReason: 'end_turn' };
    });

    const result = await antigravityService.sendFollowUp('antigravity-followup-1', 'ping');

    expect(result.success).toBe(true);
    expect(acpService.promptFollowUp).toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});
