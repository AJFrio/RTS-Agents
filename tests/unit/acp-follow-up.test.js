const { createFollowUpController } = require('../../src/main/services/acp-follow-up');

function makeSession({ alive = true, promptImpl } = {}) {
  return {
    sessionId: 'acp-1',
    capabilities: { loadSession: true },
    canLoadSession: true,
    isAlive: () => alive,
    dispose: jest.fn(),
    prompt: jest.fn(promptImpl || (() => Promise.resolve({ stopReason: 'end_turn' }))),
  };
}

describe('acp-follow-up controller', () => {
  let acp;
  let hooks;
  let controller;

  beforeEach(() => {
    acp = {
      resolveAdapter: jest.fn(() => 'fake-adapter'),
      openSession: jest.fn(),
      loadSession: jest.fn(),
    };
    hooks = {
      getRecord: jest.fn(),
      onUserMessage: jest.fn(),
      onTurnStart: jest.fn(),
      onTurnEnd: jest.fn(),
      onStreamText: jest.fn(),
    };
    controller = createFollowUpController({
      provider: 'test',
      acpService: acp,
      adapterName: 'test-adapter',
      hooks,
    });
  });

  afterEach(() => controller.disposeAll());

  test('reports no follow-up support for an unknown task', () => {
    hooks.getRecord.mockReturnValue(null);
    expect(controller.supportsFollowUp('nope')).toBe(false);
  });

  test('uses the live session when one is registered', async () => {
    const session = makeSession();
    controller.register('task-1', session, { projectPath: '/repo' });
    hooks.getRecord.mockReturnValue({ id: 'task-1', projectPath: '/repo' });

    await controller.sendFollowUp('task-1', 'hello');

    expect(session.prompt).toHaveBeenCalledWith('hello');
    expect(acp.loadSession).not.toHaveBeenCalled();
    expect(hooks.onUserMessage).toHaveBeenCalledWith('task-1', 'hello');
    expect(hooks.onTurnEnd).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ stopReason: 'end_turn', error: null })
    );
  });

  test('resumes via session/load when no live session exists', async () => {
    const resumed = makeSession();
    acp.loadSession.mockResolvedValue(resumed);
    hooks.getRecord.mockReturnValue({
      id: 'task-1',
      projectPath: '/repo',
      acpSessionId: 'ses-old',
    });

    await controller.sendFollowUp('task-1', 'still there?');

    expect(acp.loadSession).toHaveBeenCalledWith(
      expect.objectContaining({ acpSessionId: 'ses-old', cwd: '/repo' })
    );
    expect(resumed.prompt).toHaveBeenCalledWith('still there?');
    // The resumed session must be registered for subsequent turns.
    expect(controller.getLiveSession('task-1')).toBe(resumed);
  });

  test('rejects when there is no live session and nothing to resume', async () => {
    hooks.getRecord.mockReturnValue({ id: 'task-1', projectPath: '/repo' });

    await expect(controller.sendFollowUp('task-1', 'hi')).rejects.toThrow(/cannot accept/i);
    expect(acp.loadSession).not.toHaveBeenCalled();
  });

  test('surfaces an unsupported-load failure as a clear error', async () => {
    acp.loadSession.mockRejectedValue(
      Object.assign(new Error('no loadSession'), { phase: 'load-unsupported' })
    );
    hooks.getRecord.mockReturnValue({
      id: 'task-1',
      projectPath: '/repo',
      acpSessionId: 'ses-old',
    });

    await expect(controller.sendFollowUp('task-1', 'hi')).rejects.toThrow(/cannot resume/i);
  });

  test('marks the turn failed and drops a dead session', async () => {
    // Alive when the turn starts, dead by the time it fails - the real
    // shape of an adapter crashing mid-turn.
    let alive = true;
    const session = makeSession({
      promptImpl: () => {
        alive = false;
        return Promise.reject(Object.assign(new Error('boom'), { phase: 'exit' }));
      },
    });
    session.isAlive = () => alive;
    controller.register('task-1', session, { projectPath: '/repo' });
    hooks.getRecord.mockReturnValue({ id: 'task-1', projectPath: '/repo' });

    await expect(controller.sendFollowUp('task-1', 'hi')).rejects.toThrow('boom');

    expect(hooks.onTurnEnd).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ error: expect.stringContaining('boom') })
    );
    expect(controller.getLiveSession('task-1')).toBeUndefined();
  });

  test('supportsFollowUp is true when a resumable id is stored', () => {
    hooks.getRecord.mockReturnValue({ id: 'task-1', acpSessionId: 'ses-old' });
    expect(controller.supportsFollowUp('task-1')).toBe(true);
  });

  test('rejects an empty message without touching the session', async () => {
    const session = makeSession();
    controller.register('task-1', session, { projectPath: '/repo' });

    await expect(controller.sendFollowUp('task-1', '   ')).rejects.toThrow(/required/i);
    expect(session.prompt).not.toHaveBeenCalled();
  });
});

describe('acp-follow-up resume against a real adapter', () => {
  const path = require('path');
  const os = require('os');
  const realAcp = jest.requireActual('../../src/main/services/acp-service');
  const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-acp-adapter.js');

  function controllerFor(scenario, records) {
    return createFollowUpController({
      provider: 'Fake',
      acpService: {
        ...realAcp,
        // The fixture is spawned via node, not a resolved adapter binary.
        resolveAdapter: () => process.execPath,
        loadSession: (opts) =>
          realAcp.loadSession({
            ...opts,
            command: process.execPath,
            args: [FIXTURE],
            env: { FAKE_ACP_SCENARIO: scenario },
            initTimeoutMs: 3000,
          }),
      },
      adapterName: 'fake',
      hooks: {
        getRecord: (taskId) => records[taskId] || null,
        onUserMessage: (taskId, text) => records[taskId].messages.push(`user:${text}`),
        onTurnEnd: (taskId, result) => records[taskId].lastResult = result,
        onStreamText: (taskId, text) => records[taskId].messages.push(`agent:${text}`),
      },
    });
  }

  test('resumes a persisted session after a restart and replays history', async () => {
    const records = {
      'task-1': {
        id: 'task-1',
        projectPath: os.tmpdir(),
        acpSessionId: 'ses-from-last-run',
        messages: [],
      },
    };
    const controller = controllerFor('loadable', records);

    try {
      // No live session exists - this is the cold-start path.
      expect(controller.getLiveSession('task-1')).toBeUndefined();
      expect(controller.supportsFollowUp('task-1')).toBe(true);

      const result = await controller.sendFollowUp('task-1', 'what were we doing?');

      expect(result.success).toBe(true);
      // History replayed by the adapter, then the user turn, then the reply.
      expect(records['task-1'].messages).toEqual([
        'agent:history:one',
        'agent:history:two',
        'user:what were we doing?',
        'agent:turn:1:what were we doing?',
      ]);
      // The resumed session is now live for further turns.
      expect(controller.getLiveSession('task-1')).toBeDefined();
    } finally {
      controller.disposeAll();
    }
  }, 20000);

  test('reports a clear error when the adapter cannot load sessions', async () => {
    const records = {
      'task-1': {
        id: 'task-1',
        projectPath: os.tmpdir(),
        acpSessionId: 'ses-from-last-run',
        messages: [],
      },
    };
    const controller = controllerFor('not-loadable', records);

    try {
      await expect(controller.sendFollowUp('task-1', 'hello')).rejects.toThrow(
        /does not support loading previous sessions/i
      );
      // Nothing was written to the transcript for a turn that never ran.
      expect(records['task-1'].messages).toEqual([]);
    } finally {
      controller.disposeAll();
    }
  }, 20000);
});
