/**
 * Shared follow-up path for local ACP-tracked tasks.
 *
 * Appends the user turn, marks the task running, and accepts the next
 * session/prompt as soon as it is written or queued. The turn completes
 * in the background and patches status when it finishes.
 */

const acpService = require('./acp-service');
const { appendUserMessage } = require('./opencode-session-parser');

/**
 * @param {object} options
 * @param {string} options.taskId
 * @param {string} options.message
 * @param {() => object|null} options.getRecord
 * @param {object} options.connectOptions - Used only when resuming via session/load.
 * @param {(patch: object, debounced?: boolean) => void} options.updateRecord
 * @param {string} [options.failedLabel]
 */
async function sendAcpFollowUp({
  taskId,
  message,
  getRecord,
  connectOptions,
  updateRecord,
  failedLabel = 'ACP',
}) {
  const text = String(message || '').trim();
  if (!text) {
    throw new Error('Message is required');
  }
  const record = typeof getRecord === 'function' ? getRecord() : null;
  if (!record) {
    throw new Error(`Task not found: ${taskId}`);
  }
  if (!acpService.canFollowUp(taskId, record)) {
    throw new Error('This session is no longer live. Start a new task.');
  }

  const timestamp = new Date().toISOString();
  updateRecord({
    streamMessages: appendUserMessage(record.streamMessages || [], text, timestamp),
    status: 'running',
    error: null,
  });

  let acceptedSettled = false;
  let acceptResolve;
  let acceptReject;
  const accepted = new Promise((resolve, reject) => {
    acceptResolve = resolve;
    acceptReject = reject;
  });

  const turn = acpService
    .promptFollowUp(taskId, text, {
      connectOptions,
      record: typeof getRecord === 'function' ? getRecord() : record,
      onAccepted: () => {
        if (!acceptedSettled) {
          acceptedSettled = true;
          acceptResolve();
        }
      },
    })
    .then((result) => {
      const failed = result.stopReason === 'error' || result.stopReason === 'cancelled';
      updateRecord({
        status: failed ? 'failed' : 'completed',
        error: failed ? `${failedLabel} ACP turn ended with stopReason ${result.stopReason}` : null,
      });
      return result;
    })
    .catch((err) => {
      if (!acceptedSettled) {
        acceptedSettled = true;
        acceptReject(err);
      }
      updateRecord({
        status: 'failed',
        error: err?.message || String(err),
      });
      throw err;
    });

  turn.catch(() => {
    // Status is already patched above; avoid an unhandled rejection when
    // the IPC caller only awaited acceptance.
  });

  await accepted;
  return { success: true };
}

module.exports = { sendAcpFollowUp };
