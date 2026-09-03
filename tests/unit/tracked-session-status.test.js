const {
  sessionStatusSignature,
  reconcileOrphanRunningSessions,
} = require('../../src/main/utils/tracked-session-status');

describe('tracked-session-status', () => {
  test('sessionStatusSignature changes when status changes', () => {
    const running = sessionStatusSignature([
      { id: 'a', status: 'running', updatedAt: '1' },
    ]);
    const completed = sessionStatusSignature([
      { id: 'a', status: 'completed', updatedAt: '2' },
    ]);
    expect(completed).not.toBe(running);
  });

  test('reconcileOrphanRunningSessions completes sessions without a live child', () => {
    const { sessions, changed } = reconcileOrphanRunningSessions(
      [
        { id: 'live', status: 'running' },
        { id: 'dead', status: 'running' },
        { id: 'done', status: 'completed' },
      ],
      { hasLiveSession: (id) => id === 'live' }
    );
    expect(changed).toBe(true);
    expect(sessions.find((s) => s.id === 'live').status).toBe('running');
    expect(sessions.find((s) => s.id === 'dead').status).toBe('completed');
    expect(sessions.find((s) => s.id === 'done').status).toBe('completed');
  });
});
