const { sessionEvents, emitTrackedSessionUpdate } = require('../../src/main/services/session-events');

describe('session-events', () => {
  afterEach(() => {
    sessionEvents.removeAllListeners('updated');
  });

  test('emitTrackedSessionUpdate forwards status changes', () => {
    const seen = [];
    sessionEvents.on('updated', (payload) => seen.push(payload));

    emitTrackedSessionUpdate(
      'cursor',
      { id: 'cursor-cli-1', rawId: 'cursor-cli-1', status: 'completed', updatedAt: 't' },
      { statusChanged: true, details: { status: 'completed' } }
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      provider: 'cursor',
      id: 'cursor-cli-1',
      rawId: 'cursor-cli-1',
      status: 'completed',
      statusChanged: true,
    });
    expect(seen[0].details.status).toBe('completed');
  });

  test('emitTrackedSessionUpdate ignores a missing record', () => {
    const seen = [];
    sessionEvents.on('updated', (payload) => seen.push(payload));
    emitTrackedSessionUpdate('cursor', null, { statusChanged: true });
    expect(seen).toHaveLength(0);
  });
});
