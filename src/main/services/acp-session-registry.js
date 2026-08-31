/**
 * Registry of live ACP sessions, keyed by our internal task id.
 *
 * Interactive follow-up turns need the adapter process to stay running
 * between messages (see `acp-service.openSession`). Those are real child
 * processes holding a project directory open, so they must be reaped when
 * idle and torn down on app quit - otherwise a user who opens a few tasks
 * and walks away leaves several coding agents running indefinitely.
 *
 * Deliberately free of Electron imports so it can be unit tested directly.
 */

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function createRegistry({ idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS, onReap } = {}) {
  // taskId -> { session, provider, projectPath, timer, createdAt }
  const entries = new Map();

  function clearTimer(entry) {
    if (entry?.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  function drop(taskId, { dispose }) {
    const entry = entries.get(taskId);
    if (!entry) return;
    clearTimer(entry);
    entries.delete(taskId);
    if (dispose) {
      try {
        entry.session.dispose();
      } catch (err) {
        console.error('ACP session dispose failed:', err?.message || err);
      }
    }
  }

  function armTimer(taskId) {
    const entry = entries.get(taskId);
    if (!entry) return;
    clearTimer(entry);
    entry.timer = setTimeout(() => {
      // The entry is removed before onReap so a handler that inspects the
      // registry sees consistent state.
      drop(taskId, { dispose: true });
      if (typeof onReap === 'function') {
        try {
          onReap(taskId, entry);
        } catch (err) {
          console.error('ACP reap handler failed:', err?.message || err);
        }
      }
    }, idleTimeoutMs);
    // Never hold the process open just to reap an idle adapter.
    if (typeof entry.timer.unref === 'function') entry.timer.unref();
  }

  return {
    set(taskId, session, meta = {}) {
      // Replacing an existing session must not orphan the old process.
      if (entries.has(taskId)) drop(taskId, { dispose: true });

      entries.set(taskId, {
        session,
        provider: meta.provider || null,
        projectPath: meta.projectPath || null,
        createdAt: new Date().toISOString(),
        timer: null,
      });
      armTimer(taskId);
      return session;
    },

    /**
     * Returns the live session, or undefined. A session whose adapter died on
     * its own is dropped here rather than handed back - callers should treat
     * a miss as "no live session" and fall back accordingly.
     */
    get(taskId) {
      const entry = entries.get(taskId);
      if (!entry) return undefined;
      if (!entry.session.isAlive()) {
        // Already dead; drop without a redundant dispose.
        drop(taskId, { dispose: false });
        return undefined;
      }
      return entry.session;
    },

    has(taskId) {
      return this.get(taskId) !== undefined;
    },

    touch(taskId) {
      if (!entries.has(taskId)) return false;
      armTimer(taskId);
      return true;
    },

    release(taskId) {
      drop(taskId, { dispose: true });
    },

    describe(taskId) {
      const entry = entries.get(taskId);
      if (!entry) return null;
      return {
        provider: entry.provider,
        projectPath: entry.projectPath,
        acpSessionId: entry.session.sessionId,
        createdAt: entry.createdAt,
        alive: entry.session.isAlive(),
      };
    },

    size() {
      return entries.size;
    },

    disposeAll() {
      for (const taskId of Array.from(entries.keys())) {
        drop(taskId, { dispose: true });
      }
    },
  };
}

module.exports = {
  DEFAULT_IDLE_TIMEOUT_MS,
  createRegistry,
};
