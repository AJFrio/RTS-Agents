const path = require('path');
const os = require('os');
const configStore = require('./config-store');
const projectService = require('./project-service');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');
const { isCommandRunnable, spawnCli, toAdapterSpec } = require('../utils/cli-spawn');
const { applySessionUpdate } = require('./opencode-session-parser');
const { sendAcpFollowUp } = require('./acp-follow-up');

const ACP_PERSIST_DEBOUNCE_MS = 1000;

class AntigravityService {
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
    const args = ['--print', prompt, '--print-timeout', '30m'];
    if (model) {
      args.push('--model', String(model));
    }

    return new Promise((resolve, reject) => {
      const child = spawnCli(antigravityCmd, args, {
        cwd: projectPath,
        detached: true,
        stdio: 'ignore',
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

      child.unref();

      const entry = {
        id: sessionId,
        rawId: sessionId,
        prompt,
        projectPath,
        status: 'running',
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

  _applyAcpUpdate(sessionId, update) {
    const current = this.trackedSessions.find((x) => x.id === sessionId);
    if (!current) return;
    const next = applySessionUpdate(
      current.streamMessages || [],
      update,
      new Date().toISOString()
    );
    if (next === current.streamMessages) return;
    this._updateSession(sessionId, { streamMessages: next }, true);
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
    const record = this.trackedSessions.find((x) => x.id === rawId);
    if (!record) {
      throw new Error(`Task not found: ${rawId}`);
    }
    return sendAcpFollowUp({
      taskId: rawId,
      message,
      getRecord: () => this.trackedSessions.find((x) => x.id === rawId),
      connectOptions: acpService.hasLiveSession(rawId) ? {} : this._acpConnectOptions(record),
      updateRecord: (patch) => this._updateSession(rawId, patch),
      failedLabel: 'Antigravity',
    });
  }

  _updateSession(sessionId, patch, debounced = false) {
    const idx = this.trackedSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    this.trackedSessions[idx] = {
      ...this.trackedSessions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (debounced) {
      this._persistSessionsDebounced();
    } else {
      this._persistSessions();
    }
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
      canFollowUp: acpService.canFollowUp(t.id, t),
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
