/**
 * Minimal Agent Client Protocol (ACP) client for local coding-agent adapters.
 *
 * Speaks JSON-RPC 2.0 framed as newline-delimited JSON over the adapter's
 * stdio (protocol version 1). The official `@agentclientprotocol/sdk` is
 * ESM-only and therefore incompatible with this CommonJS main process, so
 * the narrow client surface we need is implemented here:
 *
 *   initialize -> session/new|session/load -> [session/set_mode] -> session/prompt*
 *   with session/update notifications forwarded to the caller,
 *   session/request_permission answered per the caller's permission policy,
 *   and every other agent->client request answered with JSON-RPC -32601 so
 *   the agent can never hang waiting on an unhandled request.
 *
 * `connect` keeps the adapter alive so later `session/prompt` turns can reuse
 * the same session. `runPrompt` is the one-shot wrapper (connect → prompt →
 * close) used by tests and any caller that still wants kill-on-completion.
 *
 * Fallback rule for callers: `err.fallbackAllowed` is true only when the
 * failure happened before any agent work began (spawn failure, initialize
 * timeout/error, protocol version mismatch, or adapter exit before the
 * prompt was sent). After the prompt is sent the task is marked failed and
 * must NOT be re-dispatched through the legacy CLI path.
 */

const { spawnSync } = require('child_process');
const {
  buildSpawnArgs,
  isCommandRunnable,
  platformBin,
  spawnCli,
  spawnCliSync,
  toAdapterSpec,
} = require('../utils/cli-spawn');

const PROTOCOL_VERSION = 1;
const STDERR_CAP = 2000;
const DEFAULT_INIT_TIMEOUT_MS = 15000;
const ADAPTER_PROBE_TIMEOUT_MS = 3000;
const SAFE_TOOL_KINDS = new Set(['read', 'edit', 'execute']);

// provider -> { command, args } | null (probe results are cached for the session)
const adapterCache = new Map();

function adapterCandidates(provider) {
  switch (provider) {
    case 'claude':
      return [
        { command: platformBin('claude-agent-acp'), args: [], probe: 'version' },
        { command: platformBin('claude-code-acp'), args: [], probe: 'version' },
        { command: platformBin('claude'), args: ['acp'], probe: 'help-subcommand' },
        { command: platformBin('claude'), args: ['--acp'], probe: 'help-flag' },
      ];
    case 'codex':
      return [
        { command: platformBin('codex-acp'), args: [], probe: 'version' },
        { command: platformBin('codex'), args: ['acp'], probe: 'help-subcommand' },
      ];
    case 'cursor':
      return [
        { command: platformBin('agent'), args: ['acp'], probe: 'version' },
        { command: platformBin('cursor-agent'), args: ['acp'], probe: 'version' },
      ];
    case 'antigravity':
      return [
        { command: 'agy', args: ['acp'], probe: 'help-subcommand' },
        { command: 'agy', args: ['--acp'], probe: 'help-flag' },
      ];
    default:
      return [];
  }
}

function probeCandidate(candidate) {
  if (candidate.probe === 'version') {
    return isCommandRunnable(candidate.command, ['--version'], {
      timeout: ADAPTER_PROBE_TIMEOUT_MS,
    });
  }
  if (candidate.probe === 'help-subcommand') {
    return isCommandRunnable(candidate.command, [...candidate.args, '--help'], {
      timeout: ADAPTER_PROBE_TIMEOUT_MS,
    });
  }
  if (candidate.probe === 'help-flag') {
    try {
      const result = spawnCliSync(candidate.command, ['--help'], {
        timeout: ADAPTER_PROBE_TIMEOUT_MS,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.error) return false;
      const text = `${result.stdout || ''}\n${result.stderr || ''}`;
      return candidate.args.some((flag) => text.includes(flag));
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Resolve the ACP adapter for a provider, probing PATH once and caching.
 * OpenCode ships its own ACP server (`opencode acp`) and is resolved by
 * opencode-service (null here).
 * @returns {{command: string, args: string[]}|null}
 */
function resolveAdapter(provider) {
  const candidates = adapterCandidates(provider);
  if (candidates.length === 0) return null;
  if (adapterCache.has(provider)) return adapterCache.get(provider);

  let spec = null;
  for (const candidate of candidates) {
    if (probeCandidate(candidate)) {
      spec = { command: candidate.command, args: [...candidate.args] };
      break;
    }
  }

  adapterCache.set(provider, spec);
  return spec;
}

function clearAdapterCache() {
  adapterCache.clear();
}

/**
 * Choose the permission option to select for a session/request_permission
 * request.
 * - 'allow-all': pick allow_once, then allow_always; never auto-reject
 *   (respond cancelled when no allow option exists).
 * - 'safe-tools': auto-allow only read/edit/execute tool kinds (parity with
 *   the legacy `--allowedTools Read,Edit,Bash` dispatch); anything else is
 *   explicitly rejected when a reject option exists, else cancelled.
 * @returns {{optionId: string}|null} null means respond with cancelled
 */
function pickPermissionOption(update, policy) {
  const options = Array.isArray(update?.options) ? update.options : [];
  const kind = update?.toolCall?.kind;
  if (policy === 'safe-tools' && kind && !SAFE_TOOL_KINDS.has(kind)) {
    return options.find((o) => String(o?.kind || '').startsWith('reject')) || null;
  }
  return (
    options.find((o) => o?.kind === 'allow_once') ||
    options.find((o) => o?.kind === 'allow_always') ||
    null
  );
}

function versionMismatchMessage(protocolVersion) {
  return (
    `ACP adapter responded with unsupported protocol version ${protocolVersion} ` +
    '(RTS speaks ACP v1; v2 is draft). Falling back to the detached CLI when available.'
  );
}

function createAcpError(phase, message, fallbackAllowed, stderrTail) {
  const error = new Error(message);
  error.phase = phase;
  error.fallbackAllowed = fallbackAllowed;
  error.stderrTail = stderrTail;
  return error;
}

function safeCall(fn, ...callArgs) {
  if (typeof fn !== 'function') return;
  try {
    fn(...callArgs);
  } catch (err) {
    console.error('ACP callback error:', err?.message || err);
  }
}

function killChildProcess(child) {
  if (!child) return;
  const pid = child.pid;
  try {
    child.stdin.end();
  } catch {
    // stdin already closed - nothing to do
  }

  const forceKill = () => {
    try {
      if (process.platform === 'win32' && pid) {
        // .cmd shims spawn nested processes; SIGTERM would not reap them.
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      // best-effort cleanup; the child may already be gone
    }
  };

  // Give stdin-EOF a chance to run the adapter's graceful exit
  // (Windows taskkill /F skips Node exit handlers).
  if (process.platform === 'win32') {
    const forceTimer = setTimeout(forceKill, 250);
    child.once('exit', () => clearTimeout(forceTimer));
    return;
  }
  forceKill();
}

function rpcError(phase, err, fallbackAllowed, stderrTail) {
  return createAcpError(
    phase,
    `ACP ${phase} failed: ${err?.message || JSON.stringify(err)}`,
    fallbackAllowed,
    stderrTail
  );
}

// RTS task id -> live AcpSession
const liveSessions = new Map();

/**
 * Open a long-lived ACP adapter session.
 *
 * Handshake is `initialize → session/new` (or `session/load` when
 * `loadSessionId` is set). The first `session/prompt` is the caller's
 * responsibility via `session.prompt(text)`.
 *
 * @param {object} options
 * @param {string} options.command
 * @param {string[]} [options.args]
 * @param {string} options.cwd
 * @param {string} [options.model]
 * @param {'allow-all'|'safe-tools'} [options.permissionPolicy]
 * @param {(update: object, sessionId: string) => void} [options.onUpdate]
 * @param {(sessionId: string) => void} [options.onSessionId]
 * @param {object} [options.env]
 * @param {number} [options.initTimeoutMs]
 * @param {string} [options.loadSessionId] - When set, resume via session/load.
 * @returns {Promise<{
 *   sessionId: string,
 *   loadSession: boolean,
 *   closed: boolean,
 *   prompt: (text: string, opts?: { onAccepted?: () => void }) => Promise<{sessionId: string, stopReason: string}>,
 *   close: () => void,
 * }>}
 */
function connect(options) {
  const {
    command,
    args = [],
    cwd,
    model,
    permissionPolicy = 'allow-all',
    onUpdate,
    onSessionId,
    env,
    initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
    loadSessionId = null,
  } = options;

  return new Promise((resolveConnect, rejectConnect) => {
    let child;
    try {
      child = spawnCli(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env || {},
      });
    } catch (err) {
      rejectConnect(
        createAcpError('spawn', `Failed to start ACP adapter: ${err.message}`, true)
      );
      return;
    }

    let connectSettled = false;
    let closed = false;
    let promptSent = false;
    let sessionId = loadSessionId || null;
    let loadSessionCapable = false;
    let nextId = 1;
    let initTimer = null;
    let stderrTail = '';
    let stdoutBuf = '';
    const pending = new Map();
    const promptQueue = [];
    let currentPrompt = null;
    let session = null;

    function rejectPending(error) {
      for (const entry of pending.values()) {
        entry.reject(error);
      }
      pending.clear();
      if (currentPrompt) {
        const job = currentPrompt;
        currentPrompt = null;
        job.reject(error);
      }
      while (promptQueue.length) {
        promptQueue.shift().reject(error);
      }
    }

    function finishClose() {
      if (session) safeCall(session._onClose);
    }

    function rejectConnectOnce(error) {
      if (connectSettled) return;
      connectSettled = true;
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      closed = true;
      rejectPending(error);
      killChildProcess(child);
      rejectConnect(error);
    }

    function failConnect(phase, message, fallbackAllowed) {
      rejectConnectOnce(createAcpError(phase, message, fallbackAllowed, stderrTail));
    }

    function close() {
      if (closed) return;
      closed = true;
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      const error = createAcpError('closed', 'ACP session closed', false, stderrTail);
      rejectPending(error);
      killChildProcess(child);
      if (connectSettled) finishClose();
    }

    function sendRaw(message) {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch {
        // child died mid-write; the exit handler rejects pending work
      }
    }

    function request(method, params, phase) {
      return new Promise((resolve, reject) => {
        if (closed) {
          reject(createAcpError('closed', 'ACP session is closed', false, stderrTail));
          return;
        }
        const id = nextId;
        nextId += 1;
        pending.set(id, { phase, resolve, reject });
        sendRaw({ jsonrpc: '2.0', id, method, params });
      });
    }

    function pumpPrompt() {
      if (closed || currentPrompt || promptQueue.length === 0) return;
      const job = promptQueue.shift();
      currentPrompt = job;
      promptSent = true;
      request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: job.text }] },
        'prompt'
      )
        .then((result) => {
          if (currentPrompt !== job) return;
          currentPrompt = null;
          job.resolve({ sessionId, stopReason: result?.stopReason || 'end_turn' });
          pumpPrompt();
        })
        .catch((err) => {
          if (currentPrompt !== job) return;
          currentPrompt = null;
          job.reject(
            err?.phase
              ? err
              : rpcError('prompt', err, false, stderrTail)
          );
          pumpPrompt();
        });
      safeCall(job.onAccepted);
    }

    function prompt(text, { onAccepted } = {}) {
      if (closed) {
        return Promise.reject(createAcpError('closed', 'ACP session is closed', false, stderrTail));
      }
      return new Promise((resolve, reject) => {
        const job = { text, resolve, reject, onAccepted };
        if (currentPrompt) {
          safeCall(onAccepted);
          job.onAccepted = null;
        }
        promptQueue.push(job);
        pumpPrompt();
      });
    }

    async function handshake() {
      initTimer = setTimeout(() => {
        failConnect(
          'initialize',
          `ACP adapter did not respond to initialize within ${initTimeoutMs}ms`,
          true
        );
      }, initTimeoutMs);

      let initResult;
      try {
        initResult = await request(
          'initialize',
          {
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {
              fs: { readTextFile: false, writeTextFile: false },
              terminal: false,
            },
          },
          'initialize'
        );
      } catch (err) {
        if (err?.phase === 'exit' || err?.phase === 'closed') {
          failConnect(err.phase, err.message, err.fallbackAllowed !== false);
          return;
        }
        failConnect(
          'initialize',
          `ACP initialize failed: ${err.message || JSON.stringify(err)}`,
          true
        );
        return;
      }
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }
      if (connectSettled || closed) return;

      if (initResult?.protocolVersion !== PROTOCOL_VERSION) {
        failConnect('version', versionMismatchMessage(initResult?.protocolVersion), true);
        return;
      }
      loadSessionCapable = Boolean(initResult?.agentCapabilities?.loadSession);

      if (loadSessionId) {
        if (!loadSessionCapable) {
          failConnect('session-load', 'ACP adapter does not support session/load', true);
          return;
        }
        let loaded;
        try {
          loaded = await request(
            'session/load',
            { sessionId: loadSessionId, cwd, mcpServers: [] },
            'session-load'
          );
        } catch (err) {
          failConnect(
            'session-load',
            `ACP session-load failed: ${err.message || JSON.stringify(err)}`,
            true
          );
          return;
        }
        if (connectSettled || closed) return;
        sessionId = loaded?.sessionId || loadSessionId;
        if (!sessionId) {
          failConnect('session-load', 'ACP adapter returned no sessionId', true);
          return;
        }
        safeCall(onSessionId, sessionId);
      } else {
        let newResult;
        try {
          newResult = await request('session/new', { cwd, mcpServers: [] }, 'session-new');
        } catch (err) {
          if (err?.phase === 'exit') {
            failConnect('exit', err.message, !promptSent);
            return;
          }
          failConnect(
            'session-new',
            `ACP session-new failed: ${err.message || JSON.stringify(err)}`,
            false
          );
          return;
        }
        if (connectSettled || closed) return;
        sessionId = newResult?.sessionId || null;
        if (!sessionId) {
          failConnect('session-new', 'ACP adapter returned no sessionId', false);
          return;
        }
        safeCall(onSessionId, sessionId);
        const availableModes = Array.isArray(newResult?.modes?.availableModes)
          ? newResult.modes.availableModes
          : [];
        const match = model
          ? availableModes.find((m) => (m?.id ?? m?.value) === model)
          : null;
        if (match && match.id !== newResult?.modes?.currentModeId) {
          try {
            await request(
              'session/set_mode',
              { sessionId, modeId: match.id },
              'set-mode'
            );
          } catch (err) {
            failConnect(
              'set-mode',
              `ACP set-mode failed: ${err.message || JSON.stringify(err)}`,
              false
            );
            return;
          }
        }
      }

      if (connectSettled || closed) return;
      connectSettled = true;
      session = {
        get sessionId() {
          return sessionId;
        },
        get loadSession() {
          return loadSessionCapable;
        },
        get closed() {
          return closed;
        },
        prompt,
        close,
        _onClose: null,
      };
      resolveConnect(session);
    }

    child.on('error', (err) => {
      if (!connectSettled) {
        failConnect('spawn', `Failed to start ACP adapter: ${err.message}`, true);
      }
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let newlineIdx = stdoutBuf.search(/\r?\n/);
      while (newlineIdx !== -1) {
        const line = stdoutBuf.slice(0, newlineIdx);
        stdoutBuf = stdoutBuf.slice(newlineIdx).replace(/^\r?\n/, '');
        handleMessage(line);
        newlineIdx = stdoutBuf.search(/\r?\n/);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrTail += chunk.toString();
      if (stderrTail.length > STDERR_CAP) {
        stderrTail = stderrTail.slice(-STDERR_CAP);
      }
    });

    child.on('exit', (code) => {
      if (closed) return;
      closed = true;
      const error = createAcpError(
        'exit',
        `ACP adapter exited (code ${code}).${stderrTail.trim() ? `\n${stderrTail.trim()}` : ''}`,
        !promptSent,
        stderrTail
      );
      rejectPending(error);
      if (!connectSettled) {
        connectSettled = true;
        if (initTimer) {
          clearTimeout(initTimer);
          initTimer = null;
        }
        rejectConnect(error);
        return;
      }
      finishClose();
    });

    function handleMessage(line) {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return; // non-JSON noise on stdout must not break the stream
      }

      if (msg.id !== undefined && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          const err = new Error(msg.error.message || JSON.stringify(msg.error));
          err.rpcError = msg.error;
          entry.reject(err);
        } else {
          entry.resolve(msg.result);
        }
        return;
      }

      if (msg.method === 'session/update') {
        safeCall(onUpdate, msg.params?.update, msg.params?.sessionId);
        return;
      }

      if (msg.method !== undefined && msg.id !== undefined) {
        // Agent->client request. Answer everything we do not implement so
        // the adapter never hangs waiting on a missing response.
        if (msg.method === 'session/request_permission') {
          const option = pickPermissionOption(msg.params, permissionPolicy);
          sendRaw({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              outcome: option
                ? { outcome: 'selected', optionId: option.optionId }
                : { outcome: 'cancelled' },
            },
          });
        } else {
          sendRaw({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: 'Method not found' },
          });
        }
      }
    }

    handshake().catch((err) => {
      if (!connectSettled) {
        failConnect(err.phase || 'initialize', err.message, err.fallbackAllowed !== false);
      }
    });
  });
}

/**
 * Run one prompt turn against an ACP adapter, then kill the child.
 * Kept as a one-shot wrapper around `connect` for tests and callers that
 * do not need follow-up turns.
 *
 * @param {object} options - Same as `connect`, plus `prompt`.
 * @returns {Promise<{sessionId: string, stopReason: string}>}
 */
async function runPrompt(options) {
  const session = await connect(options);
  try {
    return await session.prompt(options.prompt);
  } finally {
    session.close();
  }
}

function getLiveSession(taskId) {
  const session = liveSessions.get(taskId);
  if (!session || session.closed) {
    liveSessions.delete(taskId);
    return null;
  }
  return session;
}

function hasLiveSession(taskId) {
  return !!getLiveSession(taskId);
}

function registerSession(taskId, session) {
  if (!taskId || !session) return;
  const previous = liveSessions.get(taskId);
  if (previous && previous !== session && !previous.closed) {
    previous.close();
  }
  liveSessions.set(taskId, session);
  const prior = session._onClose;
  session._onClose = () => {
    safeCall(prior);
    if (liveSessions.get(taskId) === session) {
      liveSessions.delete(taskId);
    }
  };
}

function canFollowUp(taskId, record) {
  if (hasLiveSession(taskId)) return true;
  return Boolean(record?.acpSessionId && record?.loadSession);
}

async function ensureSession(taskId, connectOptions, record) {
  const live = getLiveSession(taskId);
  if (live) return live;
  if (record?.acpSessionId && record?.loadSession) {
    const session = await connect({
      ...connectOptions,
      loadSessionId: record.acpSessionId,
    });
    registerSession(taskId, session);
    return session;
  }
  throw createAcpError(
    'closed',
    'This session is no longer live. Start a new task.',
    false
  );
}

function promptFollowUp(taskId, text, { connectOptions, record, onAccepted } = {}) {
  return ensureSession(taskId, connectOptions, record).then((session) =>
    session.prompt(text, { onAccepted })
  );
}

function closeSession(taskId) {
  const session = liveSessions.get(taskId);
  if (session) session.close();
  liveSessions.delete(taskId);
}

function closeAll() {
  const sessions = [...liveSessions.values()];
  liveSessions.clear();
  for (const session of sessions) {
    try {
      session.close();
    } catch {
      // best-effort cleanup on quit
    }
  }
}

module.exports = {
  PROTOCOL_VERSION,
  adapterCandidates,
  buildSpawnArgs,
  canFollowUp,
  clearAdapterCache,
  closeAll,
  closeSession,
  connect,
  ensureSession,
  getLiveSession,
  hasLiveSession,
  pickPermissionOption,
  promptFollowUp,
  registerSession,
  resolveAdapter,
  runPrompt,
  toAdapterSpec,
};
