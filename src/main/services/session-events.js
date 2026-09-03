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

module.exports = { sessionEvents, emitSessionUpdated };
