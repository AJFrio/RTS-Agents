/**
 * Shared helpers for in-memory tracked ACP/CLI sessions.
 */

function sessionStatusSignature(sessions) {
  return (sessions || [])
    .map((s) => `${s?.id || ''}:${s?.status || ''}:${s?.updatedAt || ''}`)
    .sort()
    .join(',');
}

/**
 * Sessions restored after a restart have no ACP child. Treat leftover
 * `running` rows as completed so the UI does not poll/export forever.
 */
function reconcileOrphanRunningSessions(sessions, { hasLiveSession } = {}) {
  const list = Array.isArray(sessions) ? sessions : [];
  const live = typeof hasLiveSession === 'function' ? hasLiveSession : () => false;
  let changed = false;
  const next = list.map((session) => {
    if (!session || session.status !== 'running' || live(session.id)) {
      return session;
    }
    changed = true;
    return {
      ...session,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    };
  });
  return { sessions: next, changed };
}

module.exports = { sessionStatusSignature, reconcileOrphanRunningSessions };
