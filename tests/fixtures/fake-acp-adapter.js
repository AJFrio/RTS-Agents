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
 *  model-modes      - session/new advertises modes default/sonnet; records any
 *                     session/set_mode selection and reports it as the first
 *                     "mode:<id|none>" chunk of the turn.
 *  load-session     - initialize advertises loadSession; session/load restores
 *                     the supplied sessionId.
 *  slow-prompt      - replies to session/prompt after FAKE_ACP_PROMPT_DELAY_MS
 *                     (default 200) so the client can queue a second turn.
 *  auth-required    - initialize advertises cursor_login; session/new fails
 *                     until authenticate succeeds.
 *  auth-fail        - authenticate returns an Internal error with details.
 *  cursor-extensions - prompt turn sends cursor/ask_question then
 *                     cursor/create_plan and reports the client outcomes.
 */
const fs = require('fs');
const readline = require('readline');

const scenario = process.env.FAKE_ACP_SCENARIO || 'happy';
const exitFile = process.env.FAKE_ACP_EXIT_FILE || null;
const SEP = scenario === 'crlf' ? '\r\n' : '\n';

let currentSessionId = null;
let promptId = null;
let selectedMode = null;
let nextAgentReqId = 1000;
let pendingPermissionId = null;
let pendingUnknownId = null;
let pendingAskId = null;
let pendingPlanId = null;
let authenticated = false;

function nextAgentId() {
  nextAgentReqId += 1;
  return nextAgentReqId;
}

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

process.on('SIGINT', () => {
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

function runCursorExtensionsTurn() {
  pendingAskId = nextAgentId();
  send({
    jsonrpc: '2.0',
    id: pendingAskId,
    method: 'cursor/ask_question',
    params: {
      toolCallId: 'call_q',
      questions: [{ id: 'q1', prompt: 'Mode?', options: [{ id: 'agent', label: 'Agent' }] }],
    },
  });
}

function onAskResponse(msg) {
  const outcome = msg.result?.outcome?.outcome || 'none';
  notify(`ask:${outcome}`);
  pendingPlanId = nextAgentId();
  send({
    jsonrpc: '2.0',
    id: pendingPlanId,
    method: 'cursor/create_plan',
    params: {
      toolCallId: 'call_plan',
      name: 'Plan',
      plan: 'Do the work',
      todos: [],
    },
  });
}

function onPlanResponse(msg) {
  const outcome = msg.result?.outcome?.outcome || 'none';
  notify(`plan:${outcome}`);
  if (promptId !== null) {
    reply(promptId, { stopReason: 'end_turn' });
  }
}

function runTurn() {
  notify(`mode:${selectedMode || 'none'}`);

  if (scenario === 'cursor-extensions') {
    runCursorExtensionsTurn();
    return;
  }

  // Step 1: permission request. happy/crlf/malformed offer allow_once;
  // permission-no-allow offers only reject_once.
  const options =
    scenario === 'permission-no-allow'
      ? [{ optionId: 'reject', name: 'Reject', kind: 'reject_once' }]
      : [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }];
  pendingPermissionId = nextAgentId();
  send({
    jsonrpc: '2.0',
    id: pendingPermissionId,
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
    outcome && outcome.outcome === 'selected'
      ? `allow:${outcome.optionId}`
      : `cancelled:${outcome ? outcome.outcome : 'none'}`;
  notify(`permission:${label}`);

  // Step 2: unknown agent->client request; the client must answer -32601.
  pendingUnknownId = nextAgentId();
  send({
    jsonrpc: '2.0',
    id: pendingUnknownId,
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
    msg.id !== undefined && !msg.method && (msg.result !== undefined || msg.error !== undefined);

  if (isResponse) {
    if (msg.id === pendingPermissionId) onPermissionResponse(msg);
    else if (msg.id === pendingUnknownId) onUnknownResponse(msg);
    else if (msg.id === pendingAskId) onAskResponse(msg);
    else if (msg.id === pendingPlanId) onPlanResponse(msg);
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
    const agentCapabilities =
      scenario === 'load-session' || scenario === 'happy' || scenario === 'slow-prompt'
        ? { loadSession: true }
        : {};
    const result = { protocolVersion: version, agentCapabilities };
    if (scenario === 'auth-required' || scenario === 'auth-fail') {
      result.authMethods = [{ id: 'cursor_login', name: 'Cursor Login' }];
    }
    reply(msg.id, result);
    return;
  }

  if (msg.method === 'authenticate') {
    if (scenario === 'auth-fail') {
      replyError(msg.id, {
        code: -32603,
        message: 'Internal error',
        data: { details: '[internal] self-signed certificate in certificate chain' },
      });
      return;
    }
    if (msg.params?.methodId !== 'cursor_login') {
      replyError(msg.id, { code: -32602, message: 'Unknown auth method' });
      return;
    }
    authenticated = true;
    reply(msg.id, {});
    return;
  }

  if (msg.method === 'session/load') {
    currentSessionId = msg.params?.sessionId || `ses-fake-${process.pid}-loaded`;
    reply(msg.id, { sessionId: currentSessionId });
    return;
  }

  if (msg.method === 'session/new') {
    garbageLine();
    if (scenario === 'auth-required' && !authenticated) {
      replyError(msg.id, {
        code: -32603,
        message: 'Internal error',
        data: { message: 'Failed to initialize session services' },
      });
      return;
    }
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

  if (msg.method === 'session/set_mode') {
    selectedMode = msg.params?.modeId || null;
    reply(msg.id, {});
    return;
  }

  if (msg.method === 'session/prompt') {
    promptId = msg.id;
    const text =
      Array.isArray(msg.params?.prompt) && msg.params.prompt[0]?.text
        ? String(msg.params.prompt[0].text)
        : '';
    if (scenario === 'slow-prompt') {
      notify(`prompt:${text}`);
      const delay = Number(process.env.FAKE_ACP_PROMPT_DELAY_MS || 200);
      setTimeout(() => {
        notify(`done:${text}`);
        reply(msg.id, { stopReason: 'end_turn' });
      }, delay);
      return;
    }
    runTurn();
  }
});

rl.on('close', () => {
  // Client closed stdin — treat that as a graceful shutdown so Windows
  // (where taskkill /F skips Node exit handlers) still writes FAKE_ACP_EXIT_FILE.
  process.exit(0);
});
