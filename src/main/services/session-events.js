/**
 * In-process bus for live task/session updates.
 *
 * Provider services emit here; main.js forwards `tasks:session-updated`
 * to the renderer. Status changes also invalidate the discovery cache.
 */
const { EventEmitter } = require('events');

const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(20);

function emitSessionUpdated(payload) {
  sessionEvents.emit('updated', payload);
}

/**
 * Emit a tracked ACP/CLI session update. Status changes invalidate the
 * discovery cache via main.js; stream-only updates can omit statusChanged.
 */
function emitTrackedSessionUpdate(provider, record, { statusChanged = false, details = null } = {}) {
  if (!record) return;
  emitSessionUpdated({
    provider,
    id: record.id,
    rawId: record.rawId || record.id,
    status: record.status,
    updatedAt: record.updatedAt || new Date().toISOString(),
    statusChanged: !!statusChanged,
    details,
  });
}

module.exports = { sessionEvents, emitSessionUpdated, emitTrackedSessionUpdate };
