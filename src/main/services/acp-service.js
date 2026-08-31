/**
 * Minimal Agent Client Protocol (ACP) client for local coding-agent adapters.
 *
 * Speaks JSON-RPC 2.0 framed as newline-delimited JSON over the adapter's
 * stdio (protocol version 1). The official `@agentclientprotocol/sdk` is
 * ESM-only and therefore incompatible with this CommonJS main process, so
 * the narrow client surface we need is implemented here:
 *
 *   initialize -> session/new -> [session/set_mode] -> session/prompt
 *   with session/update notifications forwarded to the caller,
 *   session/request_permission answered per the caller's permission policy,
 *   and every other agent->client request answered with JSON-RPC -32601 so
 *   the agent can never hang waiting on an unhandled request.
 *
 * Fallback rule for callers: `err.fallbackAllowed` is true only when the
 * failure happened before any agent work began (spawn failure, initialize
 * timeout/error, protocol version mismatch, or adapter exit before the
 * prompt was sent). After the prompt is sent the task is marked failed and
 * must NOT be re-dispatched through the legacy CLI path.
 */

const { spawn, spawnSync } = require('child_process');

const PROTOCOL_VERSION = 1;
const STDERR_CAP = 2000;
const DEFAULT_INIT_TIMEOUT_MS = 15000;
const ADAPTER_PROBE_TIMEOUT_MS = 3000;
const SAFE_TOOL_KINDS = new Set(['read', 'edit', 'execute']);

// Adapters are distributed as npm packages (bin shims on Windows). Cursor
// ships its agent CLI as `agent` (official name); older installs use
// `cursor-agent`.
const ADAPTER_BINARIES = {
  claude: process.platform === 'win32' ? 'claude-agent-acp.cmd' : 'claude-agent-acp',
  codex: process.platform === 'win32' ? 'codex-acp.cmd' : 'codex-acp',
};
const CURSOR_BINARIES =
  process.platform === 'win32' ? ['agent.cmd', 'cursor-agent.cmd'] : ['agent', 'cursor-agent'];

// provider -> command | null (probe results are cached for the session)
const adapterCache = new Map();

function adapterCandidates(provider) {
  if (provider === 'cursor') return CURSOR_BINARIES;
  const base = ADAPTER_BINARIES[provider];
  return base ? [base] : [];
}

/**
 * Build spawn arguments for an adapter command. On Windows, npm bin shims
 * (.cmd/.bat) cannot be spawned directly with shell:false on current Node
 * (EINVAL), so they are routed through cmd.exe with canonical per-argument
 * quoting (never shell:true with interpolated strings).
 */
function buildSpawnArgs(command, args = []) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(command))) {
    const line = [command, ...args].map(quoteWinArg).join(' ');
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', line] };
  }
  return { command, args };
}

/** Canonical Windows argument quoting (MS command-line rules). */
function quoteWinArg(arg) {
  const value = String(arg);
  if (value === '') return '""';
  if (!/[\s"]/.test(value) && !/\\$/.test(value)) return value;
  let out = '"';
  let backslashes = 0;
  for (const ch of value) {
    if (ch === '\\') {
      backslashes += 1;
      out += ch;
      continue;
    }
    if (ch === '"') {
      out += '\\'.repeat(backslashes + 1) + '"';
      backslashes = 0;
      continue;
    }
    backslashes = 0;
    out += ch;
  }
  if (backslashes > 0) out += '\\'.repeat(backslashes);
  return `${out}"`;
}

/**
 * Resolve the ACP adapter command for a provider, probing PATH once and
 * caching the result. OpenCode ships its own ACP server (`opencode acp`),
 * so it is resolved by opencode-service (null here).
 * @returns {string|null}
 */
function resolveAdapter(provider) {
  const candidates = adapterCandidates(provider);
  if (candidates.length === 0) return null;
  if (adapterCache.has(provider)) return adapterCache.get(provider);

  let command = null;
  for (const base of candidates) {
    const spec = buildSpawnArgs(base, ['--version']);
    try {
      const probe = spawnSync(spec.command, spec.args, {
        shell: false,
        stdio: 'ignore',
        timeout: ADAPTER_PROBE_TIMEOUT_MS,
        windowsHide: true,
        // Load-bearing: without an explicit env, Jest's process.env snapshot
        // hides PATH changes and the probe reports installed adapters as absent.
        env: { ...process.env },
      });
      if (!probe.error && probe.status === 0) {
        command = base;
        break;
      }
    } catch {
      command = null;
    }
  }

  adapterCache.set(provider, command);
  return command;
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

/**
 * Open a long-lived ACP session against an adapter.
 *
 * Runs `initialize -> session/new -> [session/set_mode]` and then leaves the
 * adapter process running so the caller can drive several prompt turns over
 * the same conversation. The protocol explicitly supports this: "Once a
 * prompt turn completes, the Client may send another session/prompt to
 * continue the conversation, building on the context established in previous
 * turns."
 *
 * The returned handle owns a real child process. Callers MUST call
 * `dispose()` when finished, otherwise the adapter keeps running and holds
 * its project directory open.
 *
 * @param {object} options
 * @param {string} options.command - Adapter command (already resolved).
 * @param {string[]} [options.args] - Extra adapter CLI args (e.g. ['acp']).
 * @param {string} options.cwd - Project directory for session/new.
 * @param {string} [options.model] - Requested model id; applied via
 *   session/set_mode when the adapter offers it among its session modes.
 * @param {'allow-all'|'safe-tools'} [options.permissionPolicy]
 * @param {(update: object, sessionId: string) => void} [options.onUpdate]
 * @param {(sessionId: string) => void} [options.onSessionId]
 * @param {(info: {reason: string, message: string}) => void} [options.onClosed]
 *   Fires once when the session ends for any reason (adapter exit, dispose).
 * @param {object} [options.env] - Extra environment variables.
 * @param {number} [options.initTimeoutMs]
 * @returns {Promise<AcpSession>} Resolves once the session is ready to accept
 *   prompts. Rejects with `fallbackAllowed: true` for pre-session failures.
 */
function openSession(options) {
  const {
    command,
    args = [],
    cwd,
    model,
    permissionPolicy = 'allow-all',
    onUpdate,
    onSessionId,
    onClosed,
    env,
    initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
    // When set, resume this prior conversation via session/load instead of
    // creating a fresh one. Only legal if the adapter advertises loadSession.
    acpSessionId = null,
  } = options;

  return new Promise((resolveSession, rejectSession) => {
    const spec = buildSpawnArgs(command, args);
    let child;
    try {
      child = spawn(spec.command, spec.args, {
        cwd,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ...(env || {}) },
      });
    } catch (err) {
      const error = new Error(`Failed to start ACP adapter: ${err.message}`);
      error.phase = 'spawn';
      error.fallbackAllowed = true;
      rejectSession(error);
      return;
    }

    // Session-lifetime state. `pending` and `nextId` intentionally span every
    // turn: JSON-RPC ids must stay unique for the life of the connection.
    let ready = false;      // session/new completed
    let closed = false;     // adapter gone or disposed
    let disposed = false;   // dispose() was called explicitly
    let sessionId = null;
    let capabilities = {};
    let nextId = 1;
    let initTimer = null;
    let stderrTail = '';
    let stdoutBuf = '';
    let activeTurn = null;  // { resolve, reject } for the in-flight prompt
    const pending = new Map();

    function killChild() {
      if (!child) return;
      try {
        child.stdin.end();
      } catch {
        // stdin already closed - nothing to do
      }
      try {
        if (process.platform === 'win32' && child.pid) {
          // .cmd shims spawn nested processes; SIGTERM would not reap them.
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // best-effort cleanup; the child may already be gone
      }
    }

    /**
     * Tear the session down. Any in-flight turn is rejected: after the prompt
     * was sent we can never re-dispatch it elsewhere without risking the work
     * running twice, so `fallbackAllowed` is false for turn failures.
     */
    function closeSession(phase, message, fallbackAllowed) {
      if (closed) return;
      closed = true;
      if (initTimer) clearTimeout(initTimer);

      const error = new Error(message);
      error.phase = phase;
      error.fallbackAllowed = fallbackAllowed;
      error.stderrTail = stderrTail;

      pending.clear();
      const turn = activeTurn;
      activeTurn = null;
      killChild();

      if (!ready) {
        rejectSession(error);
      } else if (turn) {
        turn.reject(error);
      }
      safeCall(onClosed, { reason: phase, message });
    }

    function sendRaw(message) {
      // The adapter can die between our last read and this write; `exit`
      // fires asynchronously, so `closed` may still be false here. Writing to
      // an ended pipe throws asynchronously and would escape the try/catch,
      // so check writability first.
      if (!child.stdin || child.stdin.destroyed || child.stdin.writableEnded) {
        return false;
      }
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
        return true;
      } catch {
        // child died mid-write; the exit handler rejects pending work
        return false;
      }
    }

    function safeCall(fn, ...callArgs) {
      if (typeof fn !== 'function') return;
      try {
        fn(...callArgs);
      } catch (err) {
        console.error('ACP callback error:', err?.message || err);
      }
    }

    function request(method, params, phase, onResult) {
      const id = nextId;
      nextId += 1;
      pending.set(id, {
        phase,
        onResult,
        onError: (err) =>
          closeSession(
            phase,
            `ACP ${phase} failed: ${err.message || JSON.stringify(err)}`,
            phase === 'initialize'
          ),
      });
      if (!sendRaw({ jsonrpc: '2.0', id, method, params })) {
        // Pipe is gone. Close now rather than waiting on `exit`, so the
        // caller gets a rejection instead of hanging forever.
        pending.delete(id);
        closeSession(
          'exit',
          `ACP adapter is not writable (${phase}); the process has exited.`,
          !ready
        );
      }
    }

    const session = {
      get sessionId() {
        return sessionId;
      },
      get capabilities() {
        return capabilities;
      },
      /**
       * True when the adapter advertised ACP's optional session/load support,
       * which is what a future cold-start resume path would require. Clients
       * MUST NOT call session/load when this is false.
       */
      get canLoadSession() {
        return capabilities?.loadSession === true;
      },
      isAlive() {
        return !closed;
      },
      /**
       * Run one prompt turn. Rejects rather than queueing if a turn is
       * already in flight - ACP has no defined semantics for overlapping
       * prompts on one session, so serialising is the caller's job.
       */
      prompt(text) {
        return new Promise((resolve, reject) => {
          if (closed) {
            const err = new Error(
              disposed ? 'ACP session was disposed' : 'ACP session is closed'
            );
            err.phase = disposed ? 'disposed' : 'exit';
            err.fallbackAllowed = false;
            reject(err);
            return;
          }
          if (activeTurn) {
            const err = new Error('ACP session already has a prompt in flight');
            err.phase = 'busy';
            err.fallbackAllowed = false;
            reject(err);
            return;
          }

          activeTurn = { resolve, reject };
          request(
            'session/prompt',
            { sessionId, prompt: [{ type: 'text', text }] },
            'prompt',
            (result) => {
              const turn = activeTurn;
              activeTurn = null;
              if (turn) {
                turn.resolve({
                  sessionId,
                  stopReason: result?.stopReason || 'end_turn',
                });
              }
            }
          );
        });
      },
      dispose() {
        if (closed) return;
        disposed = true;
        closeSession('disposed', 'ACP session disposed by caller', false);
      },
      // Test seam: simulate the adapter dying underneath us.
      killForTest() {
        killChild();
      },
    };

    function applyModeThenReady(result) {
      const availableModes = Array.isArray(result?.modes?.availableModes)
        ? result.modes.availableModes
        : [];
      const match = model
        ? availableModes.find((m) => (m?.id ?? m?.value) === model)
        : null;

      const finish = () => {
        ready = true;
        resolveSession(session);
      };

      if (match && match.id !== result?.modes?.currentModeId) {
        request('session/set_mode', { sessionId, modeId: match.id }, 'set-mode', finish);
      } else {
        finish();
      }
    }

    function sendSessionNew() {
      request('session/new', { cwd, mcpServers: [] }, 'session-new', (result) => {
        sessionId = result?.sessionId || null;
        if (!sessionId) {
          closeSession('session-new', 'ACP adapter returned no sessionId', false);
          return;
        }
        safeCall(onSessionId, sessionId);
        applyModeThenReady(result);
      });
    }

    /**
     * Resume a prior conversation. The agent replays the full history as
     * session/update notifications before responding, so `onUpdate` fires
     * for past messages too - callers that persist their own transcript
     * should expect duplicates and reconcile.
     */
    function sendSessionLoad() {
      if (capabilities?.loadSession !== true) {
        // The spec requires clients to verify the capability before calling.
        closeSession(
          'load-unsupported',
          'ACP adapter does not advertise the loadSession capability',
          true
        );
        return;
      }
      sessionId = acpSessionId;
      request(
        'session/load',
        { sessionId: acpSessionId, cwd, mcpServers: [] },
        'session-load',
        (result) => {
          safeCall(onSessionId, sessionId);
          applyModeThenReady(result);
        }
      );
    }

    initTimer = setTimeout(() => {
      closeSession(
        'initialize',
        `ACP adapter did not respond to initialize within ${initTimeoutMs}ms`,
        true
      );
    }, initTimeoutMs);

    const initId = nextId;
    nextId += 1;
    pending.set(initId, {
      phase: 'initialize',
      onResult: (result) => {
        if (initTimer) clearTimeout(initTimer);
        if (result?.protocolVersion !== PROTOCOL_VERSION) {
          closeSession(
            'version',
            `ACP adapter responded with unsupported protocol version ${result?.protocolVersion}`,
            true
          );
          return;
        }
        capabilities = result?.agentCapabilities || {};
        if (acpSessionId) {
          sendSessionLoad();
        } else {
          sendSessionNew();
        }
      },
      onError: (err) =>
        closeSession(
          'initialize',
          `ACP initialize failed: ${err.message || JSON.stringify(err)}`,
          true
        ),
    });
    sendRaw({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      },
    });

    child.on('error', (err) => {
      closeSession('spawn', `Failed to start ACP adapter: ${err.message}`, true);
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
      // Fallback is only legal before the session was ever usable; once a
      // prompt has gone out, re-dispatching could run the work twice.
      closeSession(
        'exit',
        `ACP adapter exited (code ${code}).${stderrTail.trim() ? `\n${stderrTail.trim()}` : ''}`,
        !ready
      );
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
          entry.onError(msg.error);
        } else {
          entry.onResult(msg.result);
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
  });
}

/**
 * Resume a previously created ACP session by id.
 *
 * Spawns a fresh adapter, verifies it advertises the optional `loadSession`
 * capability, and calls `session/load`. The agent replays the prior
 * conversation as `session/update` notifications before the load resolves,
 * so `onUpdate` fires for historical messages as well as new ones.
 *
 * Rejects with `phase: 'load-unsupported'` when the adapter cannot load; the
 * caller should fall back to read-only rather than silently starting a fresh
 * conversation that has lost all prior context.
 *
 * @param {object} options - As `openSession`, plus:
 * @param {string} options.acpSessionId - The prior session id to resume.
 * @returns {Promise<AcpSession>}
 */
function loadSession(options) {
  const { acpSessionId } = options || {};
  if (!acpSessionId) {
    return Promise.reject(new Error('acpSessionId is required to load a session'));
  }
  return openSession(options);
}

/**
 * Run exactly one prompt turn against an ACP adapter, then shut it down.
 *
 * This is the unattended-dispatch path: it opens a session, sends a single
 * prompt, and always disposes the adapter before resolving. Interactive
 * callers that need follow-up turns should use `openSession` instead.
 *
 * @param {object} options - As `openSession`, plus:
 * @param {string} options.prompt - User prompt text.
 * @returns {Promise<{sessionId: string, stopReason: string}>} Resolves when
 *   the prompt turn completes. Never re-dispatch after a rejection whose
 *   `fallbackAllowed` is false.
 */
function runPrompt(options) {
  const { prompt, ...sessionOptions } = options;

  return openSession(sessionOptions).then((session) => {
    return session
      .prompt(prompt)
      .then((result) => {
        session.dispose();
        return result;
      })
      .catch((err) => {
        session.dispose();
        throw err;
      });
  });
}

module.exports = {
  PROTOCOL_VERSION,
  buildSpawnArgs,
  clearAdapterCache,
  pickPermissionOption,
  resolveAdapter,
  openSession,
  loadSession,
  runPrompt,
};
