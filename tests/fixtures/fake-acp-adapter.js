#!/usr/bin/env node
/**
 * Fake ACP agent used by tests to exercise the real stdio JSON-RPC surface.
 * Scenario is selected via the FAKE_ACP_SCENARIO env var; when the process
 * exits it writes "closed" to FAKE_ACP_EXIT_FILE (if set) so tests can assert
 * the client actually terminated the adapter.
 *
 * Scenarios:
 *  happy            - full turn: permission request (allow_once), unknown
 *                     fs/read_text_file request, two message chunks, end_turn,
 *                     then stays alive until killed (proves kill-on-completion).
 *  crlf             - same as happy but NDJSON framed with \r\n.
 *  malformed        - happy + garbage non-JSON stdout lines between messages.
 *  permission-no-allow - permission request offers only reject_once.
 *  version-mismatch - initialize responds with protocolVersion 99.
 *  init-timeout     - never responds to initialize.
 *  error-response   - initialize responds with a JSON-RPC error.
 *  exit-mid         - exits with code 7 right after session/new.
  model-modes      - session/new advertises modes default/sonnet; records any
                     session/set_mode selection and reports it as the first
                     "mode:<id|none>" chunk of the turn.
  multi-turn       - minimal turn (no permission/unknown round-trips): each
                     session/prompt replies end_turn after emitting
                     "turn:<n>:<prompt text>". Stays alive between turns so
                     tests can drive several prompts over one session.
  loadable         - like multi-turn, but advertises agentCapabilities
                     .loadSession and implements session/load: replays two
                     history chunks as session/update notifications before
                     replying to the load request.
  not-loadable     - like multi-turn, but session/load returns a JSON-RPC
                     error (capability absent); used to prove the client
                     checks the capability before calling.
 */
const fs = require('fs');
const readline = require('readline');

const scenario = process.env.FAKE_ACP_SCENARIO || 'happy';
const exitFile = process.env.FAKE_ACP_EXIT_FILE || null;
const SEP = scenario === 'crlf' ? '\r\n' : '\n';

let currentSessionId = null;
let promptId = null;
let selectedMode = null;
let turnCount = 0;

process.on('exit', () => {
  if (exitFile) {
    try {
      fs.writeFileSync(exitFile, 'closed');
    } catch {
      // ignore - fixture best effort
    }
  }
});

// Node skips exit handlers when terminated by default SIGTERM handling;
// translate SIGTERM into a graceful exit so the marker file is written.
process.on('SIGTERM', () => {
  process.exit(0);
});

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + SEP);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, error) {
  send({ jsonrpc: '2.0', id, error });
}

function notify(updateText) {
  send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: currentSessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: updateText },
      },
    },
  });
}

function garbageLine() {
  if (scenario === 'malformed') {
    process.stdout.write('this is not json at all\n');
  }
}

function runTurn() {
  notify(`mode:${selectedMode || 'none'}`);

  // Step 1: permission request. happy/crlf/malformed offer allow_once;
  // permission-no-allow offers only reject_once.
  const options =
    scenario === 'permission-no-allow'
      ? [{ optionId: 'reject', name: 'Reject', kind: 'reject_once' }]
      : [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }];
  send({
    jsonrpc: '2.0',
    id: 1001,
    method: 'session/request_permission',
    params: {
      sessionId: currentSessionId,
      toolCall: { toolCallId: 'tc-1', kind: 'execute', title: 'Run tests' },
      options,
    },
  });
}

function onPermissionResponse(msg) {
  const outcome = msg.result && msg.result.outcome;
  const label =
    outcome && outcome.outcome === 'selected' ? `allow:${outcome.optionId}` : `cancelled:${outcome ? outcome.outcome : 'none'}`;
  notify(`permission:${label}`);

  // Step 2: unknown agent->client request; the client must answer -32601.
  send({
    jsonrpc: '2.0',
    id: 1002,
    method: 'fs/read_text_file',
    params: { sessionId: currentSessionId, path: '/etc/hostname' },
  });
}

function onUnknownResponse(msg) {
  const code = msg.error ? msg.error.code : 'none';
  notify(`unknown-request:${code}`);
  notify('chunk-1');
  notify('chunk-2');

  if (promptId !== null) {
    reply(promptId, { stopReason: 'end_turn' });
  }
  // Stay alive writing markers so tests can prove the client kills us.
  const marker = setInterval(() => {
    process.stdout.write('post-response-marker\n');
  }, 100);
  marker.unref();
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // non-JSON noise must not crash the fixture
  }

  const isResponse =
    msg.id !== undefined &&
    !msg.method &&
    (msg.result !== undefined || msg.error !== undefined);

  if (isResponse) {
    if (msg.id === 1001) onPermissionResponse(msg);
    else if (msg.id === 1002) onUnknownResponse(msg);
    return;
  }

  if (msg.method === 'initialize') {
    garbageLine();
    if (scenario === 'init-timeout') return;
    if (scenario === 'error-response') {
      replyError(msg.id, { code: -32000, message: 'boom' });
      return;
    }
    const version = scenario === 'version-mismatch' ? 99 : 1;
    const agentCapabilities = scenario === 'loadable' ? { loadSession: true } : {};
    reply(msg.id, { protocolVersion: version, agentCapabilities });
    return;
  }

  if (msg.method === 'session/new') {
    garbageLine();
    if (scenario === 'exit-mid') {
      process.exit(7);
    }
    currentSessionId = `ses-fake-${process.pid}-1`;
    const result = { sessionId: currentSessionId };
    if (scenario === 'model-modes') {
      result.modes = {
        currentModeId: 'default',
        availableModes: [
          { id: 'default', name: 'Default' },
          { id: 'sonnet', name: 'Sonnet' },
        ],
      };
    }
    reply(msg.id, result);
    return;
  }

  if (msg.method === 'session/load') {
    if (scenario !== 'loadable') {
      replyError(msg.id, { code: -32601, message: 'Method not found' });
      return;
    }
    currentSessionId = msg.params?.sessionId || null;
    // The spec requires replaying prior history before responding.
    notify('history:one');
    notify('history:two');
    reply(msg.id, {});
    return;
  }

  if (msg.method === 'session/set_mode') {
    selectedMode = msg.params?.modeId || null;
    reply(msg.id, {});
    return;
  }

  if (msg.method === 'session/prompt') {
    promptId = msg.id;
    if (scenario === 'multi-turn' || scenario === 'loadable' || scenario === 'not-loadable') {
      turnCount += 1;
      const text = msg.params?.prompt?.[0]?.text ?? '';
      notify(`turn:${turnCount}:${text}`);
      reply(promptId, { stopReason: 'end_turn' });
      return;
    }
    runTurn();
  }
});

rl.on('close', () => {
  // Client closed stdin; if no prompt was in flight just exit quietly.
  if (promptId === null) {
    process.exit(0);
  }
});
