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

/**
 * Run one prompt turn against an ACP adapter.
 *
 * @param {object} options
 * @param {string} options.command - Adapter command (already resolved).
 * @param {string[]} [options.args] - Extra adapter CLI args (e.g. ['acp']).
 * @param {string} options.cwd - Project directory for session/new.
 * @param {string} options.prompt - User prompt text.
 * @param {string} [options.model] - Requested model id; applied via
 *   session/set_mode when the adapter offers it among its session modes.
 * @param {'allow-all'|'safe-tools'} [options.permissionPolicy]
 * @param {(update: object, sessionId: string) => void} [options.onUpdate]
 * @param {(sessionId: string) => void} [options.onSessionId] - Fires once
 *   the ACP session is created (before the agent starts working), so
 *   callers can resolve their task card early.
 * @param {object} [options.env] - Extra environment variables.
 * @param {number} [options.initTimeoutMs]
 * @returns {Promise<{sessionId: string, stopReason: string}>} Resolves when
 *   the prompt turn completes. Never re-dispatch after a rejection whose
 *   `fallbackAllowed` is false.
 */
function runPrompt(options) {
  const {
    command,
    args = [],
    cwd,
    prompt,
    model,
    permissionPolicy = 'allow-all',
    onUpdate,
    onSessionId,
    env,
    initTimeoutMs = DEFAULT_INIT_TIMEOUT_MS,
  } = options;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnCli(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env || {},
      });
    } catch (err) {
      const error = new Error(`Failed to start ACP adapter: ${err.message}`);
      error.phase = 'spawn';
      error.fallbackAllowed = true;
      reject(error);
      return;
    }

    let settled = false;
    let promptSent = false;
    let sessionId = null;
    let nextId = 1;
    let initTimer = null;
    let stderrTail = '';
    let stdoutBuf = '';
    const pending = new Map(); // request id -> { phase, onResult, onError }

    function fail(phase, message, fallbackAllowed) {
      if (settled) return;
      settled = true;
      if (initTimer) clearTimeout(initTimer);
      pending.clear();
      killChild();
      const error = new Error(message);
      error.phase = phase;
      error.fallbackAllowed = fallbackAllowed;
      error.stderrTail = stderrTail;
      reject(error);
    }

    function succeed() {
      if (settled) return;
      settled = true;
      if (initTimer) clearTimeout(initTimer);
      pending.clear();
      killChild();
      resolve({ sessionId, stopReason: 'end_turn' });
    }

    function killChild() {
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

    function sendRaw(message) {
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch {
        // child died mid-write; the exit handler rejects pending work
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
          fail(phase, `ACP ${phase} failed: ${err.message || JSON.stringify(err)}`, phase === 'initialize'),
      });
      sendRaw({ jsonrpc: '2.0', id, method, params });
    }

    function sendSessionNew() {
      request(
        'session/new',
        { cwd, mcpServers: [] },
        'session-new',
        (result) => {
          sessionId = result?.sessionId || null;
          if (!sessionId) {
            fail('session-new', 'ACP adapter returned no sessionId', false);
            return;
          }
          safeCall(onSessionId, sessionId);
          const availableModes = Array.isArray(result?.modes?.availableModes)
            ? result.modes.availableModes
            : [];
          const match = model
            ? availableModes.find((m) => (m?.id ?? m?.value) === model)
            : null;
          if (match && match.id !== result?.modes?.currentModeId) {
            request(
              'session/set_mode',
              { sessionId, modeId: match.id },
              'set-mode',
              () => sendPrompt()
            );
          } else {
            sendPrompt();
          }
        }
      );
    }

    function sendPrompt() {
      promptSent = true;
      request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: prompt }] },
        'prompt',
        () => succeed()
      );
    }

    initTimer = setTimeout(() => {
      fail(
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
          fail('version', versionMismatchMessage(result?.protocolVersion), true);
          return;
        }
        sendSessionNew();
      },
      onError: (err) =>
        fail(
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
      fail('spawn', `Failed to start ACP adapter: ${err.message}`, true);
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
      fail(
        'exit',
        `ACP adapter exited (code ${code}).${stderrTail.trim() ? `\n${stderrTail.trim()}` : ''}`,
        !promptSent
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

module.exports = {
  PROTOCOL_VERSION,
  adapterCandidates,
  buildSpawnArgs,
  clearAdapterCache,
  pickPermissionOption,
  resolveAdapter,
  runPrompt,
  toAdapterSpec,
};
