const registryModule = require('../../src/main/services/acp-session-registry');

function fakeSession(overrides = {}) {
  let alive = true;
  return {
    sessionId: 'ses-1',
    capabilities: {},
    canLoadSession: false,
    prompt: jest.fn().mockResolvedValue({ stopReason: 'end_turn' }),
    dispose: jest.fn(() => {
      alive = false;
    }),
    isAlive: () => alive,
    ...overrides,
  };
}

describe('acp-session-registry', () => {
  let registry;

  beforeEach(() => {
    jest.useFakeTimers();
    registry = registryModule.createRegistry({ idleTimeoutMs: 60000 });
  });

  afterEach(() => {
    registry.disposeAll();
    jest.useRealTimers();
  });

  test('stores and retrieves a session by task id', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude' });

    expect(registry.get('task-1')).toBe(session);
    expect(registry.has('task-1')).toBe(true);
  });

  test('returns undefined for an unknown task id', () => {
    expect(registry.get('nope')).toBeUndefined();
    expect(registry.has('nope')).toBe(false);
  });

  test('disposes and drops a session on release', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude' });

    registry.release('task-1');

    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(registry.has('task-1')).toBe(false);
  });

  test('reaps a session after the idle timeout elapses', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude' });

    jest.advanceTimersByTime(60001);

    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(registry.has('task-1')).toBe(false);
  });

  test('touch extends the idle deadline', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude' });

    jest.advanceTimersByTime(50000);
    registry.touch('task-1');
    jest.advanceTimersByTime(50000);

    // Without the touch this would have been reaped at 60s.
    expect(session.dispose).not.toHaveBeenCalled();
    expect(registry.has('task-1')).toBe(true);
  });

  test('replacing a session disposes the previous one', () => {
    const first = fakeSession();
    const second = fakeSession();

    registry.set('task-1', first, { provider: 'claude' });
    registry.set('task-1', second, { provider: 'claude' });

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(registry.get('task-1')).toBe(second);
  });

  test('drops a session that died on its own without disposing twice', () => {
    const session = fakeSession({ isAlive: () => false });
    registry.set('task-1', session, { provider: 'claude' });

    expect(registry.get('task-1')).toBeUndefined();
    expect(registry.has('task-1')).toBe(false);
  });

  test('disposeAll tears down every live session', () => {
    const a = fakeSession();
    const b = fakeSession();
    registry.set('task-a', a, { provider: 'claude' });
    registry.set('task-b', b, { provider: 'opencode' });

    registry.disposeAll();

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
  });

  test('reaping stops the idle timer so it cannot fire twice', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude' });

    jest.advanceTimersByTime(60001);
    jest.advanceTimersByTime(60001);

    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  test('tracks metadata for reconciliation', () => {
    const session = fakeSession();
    registry.set('task-1', session, { provider: 'claude', projectPath: '/tmp/x' });

    expect(registry.describe('task-1')).toMatchObject({
      provider: 'claude',
      projectPath: '/tmp/x',
      acpSessionId: 'ses-1',
    });
  });
});
