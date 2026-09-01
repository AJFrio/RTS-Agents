/**
 * Windows-safe CLI spawn helpers.
 *
 * npm bin shims (.cmd/.bat) cannot be spawned with shell:false on current
 * Node (EINVAL). Route those through cmd.exe with canonical per-argument
 * quoting. Never use shell:true with interpolated strings.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PROBE_TIMEOUT_MS = 3000;

function isWinScript(filePath) {
  return /\.(cmd|bat)$/i.test(String(filePath));
}

/**
 * Resolve a command to an on-disk path using PATH + PATHEXT (Windows).
 * Used so extensionless names like `claude` still wrap when they are .cmd shims.
 */
function resolveWinExecutable(command) {
  const raw = String(command || '');
  if (!raw) return null;
  try {
    if (fs.existsSync(raw) && (path.isAbsolute(raw) || path.extname(raw))) {
      return raw;
    }
  } catch {
    return null;
  }
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  const names = [];
  if (path.extname(raw)) {
    names.push(raw);
  } else {
    const exts = String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean);
    names.push(raw, ...exts.map((ext) => raw + ext));
  }
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.existsSync(full)) return full;
      } catch {
        // skip unreadable PATH entries
      }
    }
  }
  return null;
}

function needsCmdWrap(command) {
  if (process.platform !== 'win32') return false;
  if (isWinScript(command)) return true;
  const resolved = resolveWinExecutable(command);
  return !!(resolved && isWinScript(resolved));
}

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

function buildSpawnArgs(command, args = []) {
  const argv = Array.isArray(args) ? args : [];
  if (needsCmdWrap(command)) {
    const line = [command, ...argv].map(quoteWinArg).join(' ');
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', line] };
  }
  return { command, args: argv };
}

function mergeSpawnOptions(options = {}) {
  const { env, ...rest } = options;
  return {
    windowsHide: true,
    ...rest,
    shell: false,
    env: { ...process.env, ...(env || {}) },
  };
}

function spawnCli(command, args = [], options = {}) {
  const spec = buildSpawnArgs(command, args);
  return spawn(spec.command, spec.args, mergeSpawnOptions(options));
}

function spawnCliSync(command, args = [], options = {}) {
  const spec = buildSpawnArgs(command, args);
  return spawnSync(spec.command, spec.args, mergeSpawnOptions(options));
}

function isCommandRunnable(cmd, args = ['--version'], options = {}) {
  if (!cmd) return false;
  try {
    const result = spawnCliSync(String(cmd), args, {
      stdio: 'ignore',
      timeout: options.timeout ?? DEFAULT_PROBE_TIMEOUT_MS,
      ...options,
    });
    if (result.error) return false;
    return result.status === 0;
  } catch {
    return false;
  }
}

function platformBin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

/**
 * Normalize a resolveAdapter result or a string mock into { command, args }.
 * String adapters keep `defaultArgs` (e.g. Cursor mocks return 'agent').
 */
function toAdapterSpec(adapter, defaultArgs = []) {
  if (!adapter) return null;
  if (typeof adapter === 'string') {
    return { command: adapter, args: [...defaultArgs] };
  }
  if (typeof adapter === 'object' && adapter.command) {
    return {
      command: adapter.command,
      args: Array.isArray(adapter.args) ? adapter.args : [...defaultArgs],
    };
  }
  return null;
}

module.exports = {
  DEFAULT_PROBE_TIMEOUT_MS,
  buildSpawnArgs,
  isCommandRunnable,
  needsCmdWrap,
  platformBin,
  quoteWinArg,
  resolveWinExecutable,
  spawnCli,
  spawnCliSync,
  toAdapterSpec,
};
