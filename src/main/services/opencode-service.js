const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const configStore = require('./config-store');
const projectService = require('./project-service');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');
const {
  isValidOpenCodeSessionId,
  parseJsonlEvent,
  appendStreamMessage,
  parseExportToMessages,
} = require('./opencode-session-parser');

const STDERR_CAP = 2000;
const EXPORT_TIMEOUT_MS = 60000;
const STDOUT_BUFFER_CAP = 512 * 1024;
const ACP_PERSIST_DEBOUNCE_MS = 1000;

function isCommandRunnable(cmd) {
  if (!cmd) return false;
  try {
    const r = spawnSync(String(cmd), ['--version'], {
      shell: false,
      stdio: 'ignore',
      timeout: 2000,
      windowsHide: true,
    });
    if (r.error) return false;
    return r.status === 0;
  } catch {
    return false;
  }
}

function supportsRunSubcommand(executable) {
  try {
    const r = spawnSync(executable, ['run', '-h'], {
      shell: false,
      stdio: 'ignore',
      timeout: 6000,
      windowsHide: true,
    });
    if (r.error) {
      return r.error.code !== 'ENOENT';
    }
    return r.status === 0;
  } catch {
    return false;
  }
}

function isWindowsTerminalAvailable() {
  if (process.platform !== 'win32') return false;
  try {
    const r = spawnSync('where', ['wt.exe'], {
      shell: false,
      stdio: 'ignore',
      timeout: 3000,
      windowsHide: true,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

class OpenCodeService {
  constructor() {
    this.trackedSessions = [];
    this._persistTimer = null;
  }

  setTrackedSessions(sessions) {
    this.trackedSessions = Array.isArray(sessions) ? sessions : [];
  }

  getTrackedSessions() {
    return this.trackedSessions;
  }

  getExecutable() {
    const cli = configStore.getSetting('cliCommands') || {};
    const custom = typeof cli?.opencode === 'string' ? cli.opencode.trim() : '';
    if (custom) return custom;
    return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
  }

  /**
   * CLI args for non-interactive work per https://opencode.ai/docs/cli/#run
   */
  buildRunArgs(projectPath, prompt, options = {}) {
    const args = ['run', '--dir', projectPath, '--format', 'json'];
    if (options.skipPermissions !== false) {
      args.push('--dangerously-skip-permissions');
    }
    if (options.model) {
      args.push('--model', String(options.model));
    }
    if (options.agent) {
      args.push('--agent', String(options.agent));
    }
    args.push(prompt);
    return args;
  }

  async isOpenCodeInstalled() {
    const cached = installStatus.getCached('opencode');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  isOpenCodeInstalledSync() {
    const cached = installStatus.getCached('opencode');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    if (isCommandRunnable(this.getExecutable())) {
      installStatus.setCached('opencode', true);
      return true;
    }
    const home = os.homedir();
    const candidates = [path.join(home, '.opencode'), path.join(home, '.config', 'opencode')];
    const installed = await pathExistsAny(candidates);
    installStatus.setCached('opencode', installed);
    return installed;
  }

  getDefaultDataPath() {
    return path.join(os.homedir(), '.opencode');
  }

  async testConnection() {
    const installed = await this.isOpenCodeInstalled();
    if (installed) {
      return providerHealth.ok('opencode', {
        configured: true,
        installed: true,
        docsUrl: 'https://opencode.ai/docs/cli/',
        endpointLabel: `${this.getExecutable()} --version`,
        message: 'OpenCode CLI is available on this machine.',
      });
    }
    return providerHealth.fail('opencode', 'OpenCode CLI not found', {
      configured: false,
      installed: false,
      docsUrl: 'https://opencode.ai/docs/cli/',
      endpointLabel: `${this.getExecutable()} --version`,
    });
  }

  _updateSession(sessionId, patch) {
    const idx = this.trackedSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    this.trackedSessions[idx] = {
      ...this.trackedSessions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    // An immediate write flushes any pending debounced stream update.
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    configStore.setOpenCodeSessions(this.trackedSessions);
  }

  _updateSessionDebounced(sessionId, patchProvider) {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._updateSession(sessionId, patchProvider());
    }, ACP_PERSIST_DEBOUNCE_MS);
  }

  _mapTrackedToAgent(t) {
    const failed = t.status === 'failed' || t.status === 'stopped';
    return {
      id: t.id,
      provider: 'opencode',
      name:
        (t.prompt && t.prompt.substring(0, 50) + (t.prompt.length > 50 ? '...' : '')) || 'OpenCode',
      status: t.status || 'running',
      prompt: t.prompt,
      repository: t.projectPath,
      rawId: t.id,
      opencodeSessionId: t.opencodeSessionId || null,
      filePath: t.filePath || null,
      summary: failed && t.error ? t.error : t.prompt || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      exitCode: t.exitCode,
    };
  }

  _handleStdoutLine(sessionId, line, state) {
    const { sessionId: parsedId, message } = parseJsonlEvent(line);
    if (parsedId && !state.opencodeSessionId) {
      state.opencodeSessionId = parsedId;
      this._updateSession(sessionId, { opencodeSessionId: parsedId });
    }
    if (message) {
      state.streamMessages = appendStreamMessage(state.streamMessages, message);
      this._updateSession(sessionId, { streamMessages: state.streamMessages });
    }
  }

  async startSession(options) {
    const { prompt, command } = options;
    const projectPath = options.projectPath || options.repository;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const opencodeCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();
    const sessionId = `opencode-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // An explicit custom CLI command opts out of ACP (it names the CLI itself).
    if (!(command && String(command).trim())) {
      return this._startAcpSession(opencodeCmd, { prompt, projectPath }, sessionId);
    }
    return this._spawnLegacySession(opencodeCmd, options, { prompt, projectPath }, sessionId);
  }

  _startAcpSession(opencodeCmd, { prompt, projectPath }, sessionId) {
    const streamState = { opencodeSessionId: null, streamMessages: [] };
    const entry = {
      id: sessionId,
      rawId: sessionId,
      prompt,
      projectPath,
      opencodeSessionId: null,
      streamMessages: [],
      status: 'running',
      exitCode: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
    configStore.setOpenCodeSessions(this.trackedSessions);

    const buildCard = (message) => ({
      ...this._mapTrackedToAgent(this._trackedEntry(sessionId)),
      message,
    });

    return new Promise((resolveCard) => {
      let cardResolved = false;
      const resolveOnce = (card) => {
        if (!cardResolved) {
          cardResolved = true;
          resolveCard(card);
        }
      };

      acpService
        .runPrompt({
          command: opencodeCmd,
          args: ['acp'],
          cwd: projectPath,
          prompt,
          permissionPolicy: 'allow-all',
          onSessionId: (acpSessionId) => {
            streamState.opencodeSessionId = acpSessionId;
            this._updateSession(sessionId, { opencodeSessionId: acpSessionId });
            resolveOnce(
              buildCard(
                'OpenCode task started over ACP. It runs in the background with live streamed output.'
              )
            );
          },
          onUpdate: (update) => {
            if (update?.sessionUpdate !== 'agent_message_chunk') return;
            const text =
              typeof update.content === 'string' ? update.content : update.content?.text;
            if (!text || !text.trim()) return;
            streamState.streamMessages = appendStreamMessage(streamState.streamMessages, {
              role: 'assistant',
              content: text,
              timestamp: new Date().toISOString(),
            });
            this._updateSessionDebounced(sessionId, () => ({
              streamMessages: streamState.streamMessages,
            }));
          },
        })
        .then(({ stopReason }) => {
          const failed = stopReason === 'error' || stopReason === 'cancelled';
          this._updateSession(
            sessionId,
            failed
              ? {
                  status: 'failed',
                  exitCode: 1,
                  error: `OpenCode ACP turn ended with stopReason ${stopReason}`,
                  streamMessages: streamState.streamMessages,
                }
              : {
                  status: 'completed',
                  exitCode: 0,
                  error: null,
                  streamMessages: streamState.streamMessages,
                }
          );
          resolveOnce(buildCard('OpenCode task finished.'));
        })
        .catch((err) => {
          // Fallback is only legal before any agent work began; after that
          // re-dispatching through the legacy CLI would run the prompt twice.
          if (!cardResolved && err?.fallbackAllowed) {
            this.trackedSessions = this.trackedSessions.filter((x) => x.id !== sessionId);
            configStore.setOpenCodeSessions(this.trackedSessions);
            this._spawnLegacySession(opencodeCmd, {}, { prompt, projectPath }, sessionId).then(
              (card) => resolveOnce(card),
              () => resolveOnce(buildCard(err.message))
            );
            return;
          }
          this._updateSession(sessionId, {
            status: 'failed',
            error: err?.message || String(err),
            streamMessages: streamState.streamMessages,
          });
          resolveOnce(buildCard(err?.message || 'ACP dispatch failed.'));
        });
    });
  }

  _trackedEntry(sessionId) {
    return this.trackedSessions.find((x) => x.id === sessionId);
  }

  _spawnLegacySession(opencodeCmd, options, { prompt, projectPath }, sessionId) {
    if (!supportsRunSubcommand(opencodeCmd)) {
      throw new Error(
        'OpenCode CLI is too old or missing the "run" subcommand. Upgrade from https://opencode.ai/docs/cli/'
      );
    }

    const args = this.buildRunArgs(projectPath, prompt, options);
    const streamState = { opencodeSessionId: null, streamMessages: [] };

    return new Promise((resolve, reject) => {
      let stderr = '';
      let stdoutBuf = '';
      const child = spawn(opencodeCmd, args, {
        cwd: projectPath,
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'OpenCode CLI not found. Install from https://opencode.ai or set a custom executable in headless/CLI settings.'
            )
          );
        } else {
          reject(new Error(`Failed to start OpenCode: ${err.message}`));
        }
      });

      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          stdoutBuf += chunk.toString();
          if (stdoutBuf.length > STDOUT_BUFFER_CAP) {
            stdoutBuf = stdoutBuf.slice(-STDOUT_BUFFER_CAP);
          }
          let newlineIdx = stdoutBuf.indexOf('\n');
          while (newlineIdx !== -1) {
            const line = stdoutBuf.slice(0, newlineIdx);
            stdoutBuf = stdoutBuf.slice(newlineIdx + 1);
            this._handleStdoutLine(sessionId, line, streamState);
            newlineIdx = stdoutBuf.indexOf('\n');
          }
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          stderr += text;
          if (stderr.length > STDERR_CAP) {
            stderr = stderr.slice(-STDERR_CAP);
          }
        });
      }

      child.on('exit', (code) => {
        if (stdoutBuf.trim()) {
          this._handleStdoutLine(sessionId, stdoutBuf, streamState);
        }
        const trimmed = stderr.trim();
        const patch = { exitCode: code };
        if (code === 0) {
          patch.status = 'completed';
          patch.error = null;
        } else {
          patch.status = 'failed';
          patch.error =
            trimmed ||
            `OpenCode exited with code ${code}. Check ~/.config/opencode and run "opencode run" in a terminal.`;
        }
        if (!streamState.opencodeSessionId) {
          const hint =
            trimmed ||
            'No OpenCode session ID was returned. Fix opencode.json config errors or upgrade the CLI.';
          patch.error = patch.error ? `${patch.error}\n\n${hint}` : hint;
        }
        this._updateSession(sessionId, patch);
      });

      child.unref();

      const entry = {
        id: sessionId,
        rawId: sessionId,
        prompt,
        projectPath,
        opencodeSessionId: null,
        streamMessages: [],
        status: 'running',
        exitCode: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
      configStore.setOpenCodeSessions(this.trackedSessions);

      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'opencode',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt,
          repository: projectPath,
          rawId: sessionId,
          opencodeSessionId: null,
          filePath: null,
          message:
            'OpenCode task started with "opencode run". It runs in the background without opening a terminal window.',
          createdAt: new Date(),
        });
      }, 400);
    });
  }

  _runExport(opencodeCmd, projectPath, opencodeSessionId) {
    const result = spawnSync(opencodeCmd, ['export', opencodeSessionId], {
      cwd: projectPath,
      shell: false,
      encoding: 'utf8',
      timeout: EXPORT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error,
    };
  }

  _buildMessagesFromTracked(t) {
    const messages = [{ role: 'user', content: t.prompt, timestamp: t.createdAt }];
    const stream = Array.isArray(t.streamMessages) ? t.streamMessages : [];
    if (stream.length > 0) {
      messages.push(...stream);
      return messages;
    }
    if (t.status === 'running') {
      messages.push({
        role: 'assistant',
        content:
          'OpenCode is running via `opencode run` in the background. Live output will appear here when available.',
      });
    } else if (t.status === 'completed') {
      messages.push({
        role: 'assistant',
        content: 'OpenCode finished successfully. Review your repository for file changes.',
      });
    } else if (t.error) {
      messages.push({
        role: 'assistant',
        content: `OpenCode failed:\n\n${t.error}`,
      });
    }
    return messages;
  }

  async getSessionDetails(rawId) {
    const t = this.trackedSessions.find((x) => x.id === rawId);
    if (!t) return null;

    const base = {
      name: t.prompt ? t.prompt.substring(0, 80) : 'OpenCode',
      prompt: t.prompt,
      repository: t.projectPath,
      projectPath: t.projectPath,
      opencodeSessionId: t.opencodeSessionId || null,
      trackingId: t.id,
      filePath: null,
      status: t.status,
      exitCode: t.exitCode,
    };

    let messages = [];

    if (t.opencodeSessionId && isValidOpenCodeSessionId(t.opencodeSessionId)) {
      const opencodeCmd = this.getExecutable();
      const exported = this._runExport(opencodeCmd, t.projectPath, t.opencodeSessionId);
      if (exported.ok && exported.stdout.trim()) {
        try {
          const parsed = JSON.parse(exported.stdout);
          messages = parseExportToMessages(parsed);
        } catch {
          messages = [];
        }
      }
      if (messages.length === 0 && !exported.ok) {
        const errText = (exported.stderr || exported.error?.message || '').trim();
        if (errText) {
          messages = this._buildMessagesFromTracked(t);
          messages.push({
            role: 'assistant',
            content: `Could not load OpenCode export:\n\n${errText}`,
          });
          return { ...base, messages };
        }
      }
    }

    if (messages.length === 0) {
      messages = this._buildMessagesFromTracked(t);
    } else {
      const hasUser = messages.some((m) => m.role === 'user');
      if (!hasUser && t.prompt) {
        messages = [{ role: 'user', content: t.prompt, timestamp: t.createdAt }, ...messages];
      }
    }

    return { ...base, messages };
  }

  async openSessionInTerminal({ projectPath, opencodeSessionId, command }) {
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Project path is required');
    }
    if (!isValidOpenCodeSessionId(opencodeSessionId)) {
      throw new Error('Valid OpenCode session ID is required (ses_…)');
    }
    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const opencodeCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();
    const tuiArgs = ['-s', opencodeSessionId];

    if (process.platform === 'win32') {
      if (isWindowsTerminalAvailable()) {
        const child = spawn('wt.exe', ['-d', projectPath, opencodeCmd, ...tuiArgs], {
          detached: true,
          stdio: 'ignore',
          shell: false,
          windowsHide: false,
        });
        child.on('error', () => {
          this._openWindowsCmdTerminal(projectPath, opencodeCmd, opencodeSessionId);
        });
        child.unref();
        return { success: true, method: 'wt' };
      }
      return this._openWindowsCmdTerminal(projectPath, opencodeCmd, opencodeSessionId);
    }

    if (process.platform === 'darwin') {
      const escapedPath = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `cd "${escapedPath}" && ${opencodeCmd} -s ${opencodeSessionId}`;
      const child = spawn('osascript', ['-e', `tell application "Terminal" to do script "${script}"`], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.unref();
      return { success: true, method: 'terminal-mac' };
    }

    const child = spawn(
      'x-terminal-emulator',
      ['-e', opencodeCmd, ...tuiArgs],
      {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
        shell: false,
      }
    );
    child.on('error', () => {
      spawn(opencodeCmd, tuiArgs, {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
        shell: false,
      }).unref();
    });
    child.unref();
    return { success: true, method: 'x-terminal-emulator' };
  }

  _openWindowsCmdTerminal(projectPath, opencodeCmd, opencodeSessionId) {
    const quotedPath = `"${projectPath.replace(/"/g, '""')}"`;
    const inner = `cd /d ${quotedPath} && ${opencodeCmd} -s ${opencodeSessionId}`;
    const child = spawn('cmd.exe', ['/c', 'start', 'OpenCode', 'cmd', '/k', inner], {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.unref();
    return { success: true, method: 'cmd' };
  }

  getAllAgents() {
    return this.trackedSessions.map((t) => this._mapTrackedToAgent(t));
  }

  async getAvailableProjects(additionalPaths = []) {
    if (!(await this.isOpenCodeInstalled())) {
      return [];
    }
    return projectService.getLocalRepos(additionalPaths);
  }
}

module.exports = new OpenCodeService();
