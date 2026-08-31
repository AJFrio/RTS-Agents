/**
 * Shared interactive follow-up logic for ACP-backed local providers.
 *
 * Each provider service (Claude, Codex, OpenCode, Cursor) tracks its own
 * session records in its own shape, so this controller owns only the parts
 * that are genuinely common:
 *
 *   - the live-session registry and its lifecycle
 *   - choosing between a live session and a session/load resume
 *   - ordering the transcript so a follow-up cannot be merged into the
 *     previous assistant message
 *
 * Provider-specific persistence is delegated back through `hooks`.
 */

const { createRegistry } = require('./acp-session-registry');

/**
 * @param {object} config
 * @param {string} config.provider - Provider key, for error messages.
 * @param {object} config.acpService - Injected for testability.
 * @param {string} config.adapterName - Adapter key for resolveAdapter().
 * @param {string[]} [config.adapterArgs] - Extra adapter CLI args.
 * @param {'allow-all'|'safe-tools'} [config.permissionPolicy]
 * @param {object} config.hooks
 * @param {(taskId: string) => object|null} config.hooks.getRecord
 * @param {(taskId: string, text: string) => void} config.hooks.onUserMessage
 * @param {(taskId: string) => void} [config.hooks.onTurnStart]
 * @param {(taskId: string, result: object) => void} config.hooks.onTurnEnd
 * @param {(taskId: string, text: string) => void} [config.hooks.onStreamText]
 */
function createFollowUpController({
  provider,
  acpService,
  adapterName,
  adapterArgs = [],
  permissionPolicy = 'allow-all',
  hooks,
}) {
  const registry = createRegistry();

  function resumableIdFor(taskId) {
    const record = hooks.getRecord(taskId);
    return record?.acpSessionId || null;
  }

  /**
   * Open a resumed session for a task whose adapter is no longer running.
   * Only legal when the adapter advertises `loadSession`; otherwise we would
   * silently start a fresh conversation that has lost all prior context.
   */
  async function resume(taskId, record) {
    const adapter = acpService.resolveAdapter(adapterName);
    if (!adapter) {
      throw new Error(`${provider} adapter is not available; cannot resume this session.`);
    }

    try {
      const session = await acpService.loadSession({
        command: adapter,
        args: adapterArgs,
        cwd: record.projectPath,
        acpSessionId: record.acpSessionId,
        permissionPolicy,
        onUpdate: (update) => {
          if (update?.sessionUpdate !== 'agent_message_chunk') return;
          const text =
            typeof update.content === 'string' ? update.content : update.content?.text;
          if (!text || !text.trim()) return;
          hooks.onStreamText?.(taskId, text);
        },
      });
      registry.set(taskId, session, { provider, projectPath: record.projectPath });
      return session;
    } catch (err) {
      if (err?.phase === 'load-unsupported') {
        throw new Error(
          `${provider} cannot resume this session: the installed adapter does not support loading previous sessions.`
        );
      }
      throw err;
    }
  }

  return {
    register(taskId, session, meta = {}) {
      return registry.set(taskId, session, { provider, ...meta });
    },

    getLiveSession(taskId) {
      return registry.get(taskId);
    },

    /**
     * A task can take a follow-up if its adapter is still live, or if we
     * stored an ACP session id we could resume from.
     */
    supportsFollowUp(taskId) {
      if (registry.has(taskId)) return true;
      return Boolean(resumableIdFor(taskId));
    },

    async sendFollowUp(taskId, message) {
      const text = typeof message === 'string' ? message.trim() : '';
      if (!text) {
        throw new Error('Follow-up message is required');
      }

      const record = hooks.getRecord(taskId);
      if (!record) {
        throw new Error(`Unknown ${provider} task ${taskId}`);
      }

      let session = registry.get(taskId);
      if (!session) {
        if (!record.acpSessionId) {
          throw new Error(
            `${provider} cannot accept a follow-up for this task: no live session and nothing to resume.`
          );
        }
        session = await resume(taskId, record);
      }

      // Record the user's turn before prompting so the streamed reply starts
      // a new assistant message instead of extending the previous one.
      hooks.onUserMessage(taskId, text);
      hooks.onTurnStart?.(taskId);

      try {
        const result = await session.prompt(text);
        const failed = result?.stopReason === 'error' || result?.stopReason === 'cancelled';
        hooks.onTurnEnd(taskId, {
          stopReason: result?.stopReason,
          error: failed
            ? `${provider} follow-up ended with stopReason ${result?.stopReason}`
            : null,
        });
        registry.touch(taskId);
        return { success: !failed, stopReason: result?.stopReason };
      } catch (err) {
        if (!session.isAlive()) {
          registry.release(taskId);
        }
        hooks.onTurnEnd(taskId, { error: err?.message || String(err) });
        throw err;
      }
    },

    disposeAll() {
      registry.disposeAll();
    },
  };
}

module.exports = { createFollowUpController };
