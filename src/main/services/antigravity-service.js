const path = require('path');
const os = require('os');
const { StringDecoder } = require('string_decoder');
const { spawn } = require('child_process');
const configStore = require('./config-store');
const projectService = require('./project-service');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');
const { isCommandRunnable, spawnCli, spawnCliSync, toAdapterSpec } = require('../utils/cli-spawn');
const {
  applySessionUpdate,
  appendUserMessage,
} = require('./opencode-session-parser');
const {
  isValidConversationId,
  parseAgyStreamLine,
  applyAgyStreamEvent,
} = require('./agy-stream-parser');
const { sendAcpFollowUp } = require('./acp-follow-up');
const { reconcileOrphanRunningSessions } = require('../utils/tracked-session-status');
const { emitTrackedSessionUpdate } = require('./session-events');

const ACP_PERSIST_DEBOUNCE_MS = 1000;
const STREAM_EMIT_DEBOUNCE_MS = 100;
const AGY_STDERR_BUFFER_CAP = 512 * 1024;

function isWindowsTerminalAvailable() {
  if (process.platform !== 'win32') return false;
  try {
    const r = spawnCliSync('where', ['wt.exe'], {
      stdio: 'ignore',
      timeout: 3000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

class AntigravityService {
  constructor() {
    this.trackedSessions = [];
    this._persistTimer = null;
    this._streamEmitTimers = new Map();
  }

  setTrackedSessions(sessions) {
    const { sessions: next, changed } = reconcileOrphanRunningSessions(
      Array.isArray(sessions) ? sessions : [],
      { hasLiveSession: (id) => acpService.hasLiveSession(id) }
    );
    this.trackedSessions = next;
    if (changed) {
      configStore.setAntigravitySessions(this.trackedSessions);
    }
  }

  getTrackedSessions() {
    return this.trackedSessions;
  }

  getExecutable() {
    const cli = configStore.getSetting('cliCommands') || {};
    const custom = typeof cli?.antigravity === 'string' ? cli.antigravity.trim() : '';
    return custom || 'agy';
  }

  getDefaultDataPath() {
    return path.join(os.homedir(), '.gemini', 'antigravity-cli');
  }

  async isAntigravityInstalled() {
    const cached = installStatus.getCached('antigravity');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  isAntigravityInstalledSync() {
    const cached = installStatus.getCached('antigravity');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    if (isCommandRunnable(this.getExecutable())) {
      installStatus.setCached('antigravity', true);
      return true;
    }

    const candidates = [this.getDefaultDataPath()];
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Antigravity'));
    }

    const installed = await pathExistsAny(candidates);
    installStatus.setCached('antigravity', installed);
    return installed;
  }

  async testConnection() {
    const installed = await this.isAntigravityInstalled();
    if (installed) {
      return providerHealth.ok('antigravity', {
        configured: true,
        installed: true,
        docsUrl: 'https://github.com/google-antigravity/antigravity-cli',
        endpointLabel: `${this.getExecutable()} --version`,
        message: 'Antigravity CLI is available on this machine.',
      });
    }
    return providerHealth.fail('antigravity', 'Antigravity CLI not found', {
      configured: false,
      installed: false,
      docsUrl: 'https://github.com/google-antigravity/antigravity-cli',
      endpointLabel: `${this.getExecutable()} --version`,
    });
  }

  async startSession(options) {
    const { prompt, projectPath, command, model } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }
    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const sessionId = `antigravity-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const adapter =
      command && String(command).trim()
        ? null
        : toAdapterSpec(acpService.resolveAdapter('antigravity'));

    if (adapter) {
      return this._startAcpSession(adapter, { prompt, projectPath, model }, sessionId);
    }
    return this._spawnLegacySession({ prompt, projectPath, command, model }, sessionId);
  }

  _startAcpSession(adapter, { prompt, projectPath, model }, sessionId) {
    const entry = {
      id: sessionId,
      rawId: sessionId,
      prompt,
      projectPath,
      status: 'running',
      streamMessages: [],
      error: null,
      conversationId: null,
      model: model || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
    this._persistSessions();

    const buildCard = (message) => ({
      id: sessionId,
      provider: 'antigravity',
      name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      status: entry.status,
      prompt,
      repository: projectPath,
      rawId: sessionId,
      filePath: null,
      message,
      createdAt: new Date(),
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
        .connect({
          command: adapter.command,
          args: adapter.args,
          cwd: projectPath,
          model,
          permissionPolicy: 'allow-all',
          onSessionId: () => {
            resolveOnce(
              buildCard(
                'Antigravity task started over ACP. Live output streams into the task details.'
              )
            );
          },
          onUpdate: (update) => this._applyAcpUpdate(sessionId, update),
        })
        .then((session) => {
          acpService.registerSession(sessionId, session);
          this._updateSession(sessionId, {
            acpSessionId: session.sessionId,
            loadSession: session.loadSession,
          });
          return session.prompt(prompt).then(({ stopReason }) => {
            const failed = stopReason === 'error' || stopReason === 'cancelled';
            this._updateSession(sessionId, {
              status: failed ? 'failed' : 'completed',
              error: failed ? `Antigravity ACP turn ended with stopReason ${stopReason}` : null,
            });
            resolveOnce(buildCard('Antigravity task finished.'));
          });
        })
        .catch((err) => {
          if (!cardResolved && err?.fallbackAllowed) {
            acpService.closeSession(sessionId);
            this.trackedSessions = this.trackedSessions.filter((x) => x.id !== sessionId);
            this._persistSessions();
            this._spawnLegacySession({ prompt, projectPath, model }, sessionId).then(
              (card) => resolveOnce(card),
              () => resolveOnce(buildCard(err.message))
            );
            return;
          }
          this._updateSession(sessionId, {
            status: 'failed',
            error: err?.message || String(err),
          });
          resolveOnce(buildCard(err?.message || 'ACP dispatch failed.'));
        });
    });
  }

  _spawnLegacySession({ prompt, projectPath, command, model }, sessionId) {
    const antigravityCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();
    const args = ['--print', prompt, '--print-timeout', '30m', '--output-format', 'stream-json'];
    if (model) {
      args.push('--model', String(model));
    }

    const state = { conversationId: null, finalized: false, stderr: '' };

    return new Promise((resolve, reject) => {
      const child = spawnCli(antigravityCmd, args, {
        cwd: projectPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'Antigravity CLI not found. Install it from https://antigravity.google or set a custom agy executable.'
            )
          );
        } else {
          reject(new Error(`Failed to start Antigravity CLI: ${err.message}`));
        }
      });

      const decoder = new StringDecoder('utf8');
      let stdoutBuf = '';
      const handleChunk = (text) => {
        stdoutBuf += text;
        let newlineIdx = stdoutBuf.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = stdoutBuf.slice(0, newlineIdx).replace(/\r$/, '');
          stdoutBuf = stdoutBuf.slice(newlineIdx + 1);
          this._handleAgyStreamLine(sessionId, line, state);
          newlineIdx = stdoutBuf.indexOf('\n');
        }
      };

      if (child.stdout) {
        child.stdout.on('data', (chunk) => handleChunk(decoder.write(chunk)));
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          state.stderr += chunk.toString();
          if (state.stderr.length > AGY_STDERR_BUFFER_CAP) {
            state.stderr = state.stderr.slice(-AGY_STDERR_BUFFER_CAP);
          }
        });
      }

      child.on('close', (code) => {
        handleChunk(decoder.end());
        if (stdoutBuf.trim()) {
          const line = stdoutBuf.replace(/\r$/, '');
          stdoutBuf = '';
          this._handleAgyStreamLine(sessionId, line, state);
        }
        if (state.finalized) return;
        state.finalized = true;
        this._clearStreamEmitTimer(sessionId);
        const trimmed = state.stderr.trim();
        this._updateSession(sessionId, {
          status: code === 0 ? 'completed' : 'failed',
          error: code === 0 ? null : trimmed || `agy exited with code ${code}`,
        });
      });

      child.unref();

      const entry = {
        id: sessionId,
        rawId: sessionId,
        prompt,
        projectPath,
        status: 'running',
        streamMessages: [],
        error: null,
        conversationId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.trackedSessions = [entry, ...this.trackedSessions].slice(0, 100);
      this._persistSessions();

      setTimeout(() => {
        resolve({
          id: sessionId,
          provider: 'antigravity',
          name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          status: 'running',
          prompt,
          repository: projectPath,
          rawId: sessionId,
          filePath: null,
          message: 'Antigravity CLI task started in the background.',
          createdAt: new Date(),
        });
      }, 400);
    });
  }

  _handleAgyStreamLine(sessionId, line, state) {
    const { event } = parseAgyStreamLine(line);
    if (!event) return;
    if (event.type === 'init') {
      if (isValidConversationId(event.conversationId) && !state.conversationId) {
        state.conversationId = event.conversationId;
        this._updateSession(sessionId, { conversationId: event.conversationId });
      }
      return;
    }
    if (event.type === 'step_update') {
      const current = this.trackedSessions.find((x) => x.id === sessionId);
      if (!current) return;
      const next = applyAgyStreamEvent(
        current.streamMessages || [],
        event,
        new Date().toISOString()
      );
      if (next === current.streamMessages) return;
      current.streamMessages = next;
      this._persistSessionsDebounced();
      this._scheduleStreamEmit(sessionId);
      return;
    }
    this._finalizeAgyResult(sessionId, event.resultData, state);
  }

  _finalizeAgyResult(sessionId, resultData, state) {
    if (state.finalized) return;
    const status = resultData?.status;
    const failed =
      status === 'ERROR' ||
      status === 'INVALID' ||
      status === 'CANCELED' ||
      status === 'INTERRUPTED';
    if (status !== 'SUCCESS' && !failed) {
      // WAITING/RUNNING keep the session running; the 'close' backstop resolves it.
      return;
    }
    state.finalized = true;
    this._clearStreamEmitTimer(sessionId);
    const stderrTail = state.stderr.trim();
    this._updateSession(sessionId, {
      status: failed ? 'failed' : 'completed',
      error: failed
        ? resultData?.error || stderrTail || `Antigravity CLI finished with status ${status}`
        : null,
    });
  }

  async openSessionInTerminal({ projectPath, conversationId, command }) {
    if (!projectPath || typeof projectPath !== 'string') {
      throw new Error('Project path is required');
    }
    if (conversationId !== undefined && conversationId !== null && !isValidConversationId(conversationId)) {
      conversationId = null;
    }
    if (!(await pathExists(projectPath))) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const agyCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();
    const agyArgs = conversationId ? ['--conversation', conversationId] : ['-c'];

    if (process.platform === 'win32') {
      if (isWindowsTerminalAvailable()) {
        const child = spawn('wt.exe', ['-d', projectPath, agyCmd, ...agyArgs], {
          detached: true,
          stdio: 'ignore',
          shell: false,
          windowsHide: false,
        });
        child.on('error', () => {
          this._openWindowsCmdTerminal(projectPath, agyCmd, agyArgs);
        });
        child.unref();
        return { success: true, method: 'wt' };
      }
      return this._openWindowsCmdTerminal(projectPath, agyCmd, agyArgs);
    }

    if (process.platform === 'darwin') {
      const escapedPath = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `cd "${escapedPath}" && ${agyCmd} ${agyArgs.join(' ')}`;
      const child = spawn(
        'osascript',
        ['-e', `tell application "Terminal" to do script "${script}"`],
        {
          detached: true,
          stdio: 'ignore',
          shell: false,
        }
      );
      child.unref();
      return { success: true, method: 'terminal-mac' };
    }

    const child = spawn('x-terminal-emulator', ['-e', agyCmd, ...agyArgs], {
      cwd: projectPath,
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.on('error', () => {
      spawn(agyCmd, agyArgs, {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
        shell: false,
      }).unref();
    });
    child.unref();
    return { success: true, method: 'x-terminal-emulator' };
  }

  _openWindowsCmdTerminal(projectPath, agyCmd, agyArgs) {
    const quotedPath = `"${projectPath.replace(/"/g, '""')}"`;
    const inner = `cd /d ${quotedPath} && ${agyCmd} ${agyArgs.join(' ')}`;
    const child = spawn('cmd.exe', ['/c', 'start', 'Antigravity', 'cmd', '/k', inner], {
      detached: true,
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.unref();
    return { success: true, method: 'cmd' };
  }

  _applyAcpUpdate(sessionId, update) {
    const current = this.trackedSessions.find((x) => x.id === sessionId);
    if (!current) return;
    const next = applySessionUpdate(current.streamMessages || [], update, new Date().toISOString());
    if (next === current.streamMessages) return;
    current.streamMessages = next;
    this._persistSessionsDebounced();
    this._scheduleStreamEmit(sessionId);
  }

  _acpConnectOptions(record) {
    const adapter = toAdapterSpec(acpService.resolveAdapter('antigravity'));
    if (!adapter) {
      throw new Error('Antigravity ACP adapter is not available');
    }
    return {
      command: adapter.command,
      args: adapter.args,
      cwd: record.projectPath,
      model: record.model,
      permissionPolicy: 'allow-all',
      onUpdate: (update) => this._applyAcpUpdate(record.id, update),
    };
  }

  async sendFollowUp(rawId, message) {
    const record = this.trackedSessions.find((x) => x.id === rawId || x.rawId === rawId);
    if (!record) {
      throw new Error(`Task not found: ${rawId}`);
    }
    if (acpService.hasLiveSession(rawId)) {
      return sendAcpFollowUp({
        taskId: rawId,
        message,
        getRecord: () => this.trackedSessions.find((x) => x.id === rawId),
        connectOptions: acpService.hasLiveSession(rawId) ? {} : this._acpConnectOptions(record),
        updateRecord: (patch) => this._updateSession(rawId, patch),
        failedLabel: 'Antigravity',
      });
    }
    if (record.status === 'running') {
      throw new Error('A turn is already in progress for this session');
    }
    if (!isValidConversationId(record.conversationId)) {
      throw new Error('No conversation ID on this session; start a new task before following up');
    }
    return this._spawnLegacyFollowUp({ record, message });
  }

  _spawnLegacyFollowUp({ record, message }) {
    const sessionId = record.id;
    const antigravityCmd = this.getExecutable();
    const args = [
      '--print',
      message,
      '--print-timeout',
      '30m',
      '--output-format',
      'stream-json',
      '--conversation',
      record.conversationId,
    ];

    // Seed the state with the existing conversationId so a re-captured init id
    // can never overwrite it (_handleAgyStreamLine only sets when falsy).
    const state = { conversationId: record.conversationId, finalized: false, stderr: '' };

    this._updateSession(sessionId, {
      status: 'running',
      error: null,
      streamMessages: appendUserMessage(
        record.streamMessages || [],
        message,
        new Date().toISOString()
      ),
    });

    return new Promise((resolve, reject) => {
      const child = spawnCli(antigravityCmd, args, {
        cwd: record.projectPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(
            new Error(
              'Antigravity CLI not found. Install it from https://antigravity.google or set a custom agy executable.'
            )
          );
        } else {
          reject(new Error(`Failed to start Antigravity CLI: ${err.message}`));
        }
      });

      const decoder = new StringDecoder('utf8');
      let stdoutBuf = '';
      const handleChunk = (text) => {
        stdoutBuf += text;
        let newlineIdx = stdoutBuf.indexOf('\n');
        while (newlineIdx !== -1) {
          const line = stdoutBuf.slice(0, newlineIdx).replace(/\r$/, '');
          stdoutBuf = stdoutBuf.slice(newlineIdx + 1);
          this._handleAgyStreamLine(sessionId, line, state);
          newlineIdx = stdoutBuf.indexOf('\n');
        }
      };

      if (child.stdout) {
        child.stdout.on('data', (chunk) => handleChunk(decoder.write(chunk)));
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          state.stderr += chunk.toString();
          if (state.stderr.length > AGY_STDERR_BUFFER_CAP) {
            state.stderr = state.stderr.slice(-AGY_STDERR_BUFFER_CAP);
          }
        });
      }

      child.on('close', (code) => {
        handleChunk(decoder.end());
        if (stdoutBuf.trim()) {
          const line = stdoutBuf.replace(/\r$/, '');
          stdoutBuf = '';
          this._handleAgyStreamLine(sessionId, line, state);
        }
        if (state.finalized) return;
        state.finalized = true;
        this._clearStreamEmitTimer(sessionId);
        const trimmed = state.stderr.trim();
        this._updateSession(sessionId, {
          status: code === 0 ? 'completed' : 'failed',
          error: code === 0 ? null : trimmed || `agy exited with code ${code}`,
        });
      });

      child.unref();

      resolve({
        id: sessionId,
        provider: 'antigravity',
        rawId: sessionId,
        success: true,
        message: 'Follow-up sent to Antigravity CLI.',
      });
    });
  }

  _updateSession(sessionId, patch) {
    const idx = this.trackedSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    const prev = this.trackedSessions[idx];
    const next = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.trackedSessions[idx] = next;
    this._persistSessions();
    const statusChanged = patch.status !== undefined && patch.status !== prev.status;
    this._emitSessionUpdated(sessionId, { statusChanged });
  }

  _emitSessionUpdated(sessionId, { statusChanged } = {}) {
    const t = this.trackedSessions.find((x) => x.id === sessionId);
    if (!t) return;
    emitTrackedSessionUpdate('antigravity', t, {
      statusChanged: !!statusChanged,
      details: this.getSessionDetails(sessionId),
    });
  }

  _scheduleStreamEmit(sessionId) {
    const existing = this._streamEmitTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    this._streamEmitTimers.set(
      sessionId,
      setTimeout(() => {
        this._streamEmitTimers.delete(sessionId);
        this._emitSessionUpdated(sessionId, { statusChanged: false });
      }, STREAM_EMIT_DEBOUNCE_MS)
    );
  }

  _clearStreamEmitTimer(sessionId) {
    const timer = this._streamEmitTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this._streamEmitTimers.delete(sessionId);
  }

  _persistSessions() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      configStore.setAntigravitySessions(this.trackedSessions);
    } catch (err) {
      console.error('Failed to persist Antigravity sessions:', err?.message || err);
    }
  }

  _persistSessionsDebounced() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistSessions();
    }, ACP_PERSIST_DEBOUNCE_MS);
  }

  getAllAgents() {
    return this.trackedSessions.map((t) => {
      const stream = Array.isArray(t.streamMessages) ? t.streamMessages : [];
      const lastContent = stream.length ? String(stream[stream.length - 1].content || '') : '';
      return {
        id: t.id,
        provider: 'antigravity',
        name:
          (t.prompt && t.prompt.substring(0, 50) + (t.prompt.length > 50 ? '...' : '')) ||
          'Antigravity',
        status: t.status || 'running',
        prompt: t.prompt,
        repository: t.projectPath,
        rawId: t.id,
        filePath: t.filePath || null,
        summary: lastContent ? lastContent.substring(0, 200) : t.prompt || '',
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });
  }

  getSessionDetails(rawId) {
    const t = this.trackedSessions.find((x) => x.id === rawId);
    if (!t) return null;
    const stream = Array.isArray(t.streamMessages) ? t.streamMessages : [];
    const fallbackAssistant = {
      role: 'assistant',
      content:
        'Session started via Antigravity CLI. For full history, use Antigravity CLI or the Antigravity desktop app in that repository.',
    };
    return {
      name: t.prompt ? t.prompt.substring(0, 80) : 'Antigravity',
      prompt: t.prompt,
      status: t.status || 'running',
      conversationId: t.conversationId || null,
      projectPath: t.projectPath,
      canFollowUp: acpService.canFollowUp(t.id, t) || isValidConversationId(t.conversationId),
      messages: [
        { role: 'user', content: t.prompt, timestamp: t.createdAt },
        ...(stream.length > 0 ? stream : [fallbackAssistant]),
      ],
      filePath: null,
    };
  }

  async getAvailableProjects(additionalPaths = []) {
    if (!(await this.isAntigravityInstalled())) {
      return [];
    }
    return projectService.getLocalRepos(additionalPaths);
  }
}

module.exports = new AntigravityService();
