const fs = require('fs');
const path = require('path');
const os = require('os');
const { upsertItem } = require('../utils/collection-utils');
const configStore = require('./config-store');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const acpService = require('./acp-service');
const { isCommandRunnable, spawnCli, toAdapterSpec } = require('../utils/cli-spawn');
const { applySessionUpdate } = require('./opencode-session-parser');
const { sendAcpFollowUp } = require('./acp-follow-up');
const { reconcileOrphanRunningSessions } = require('../utils/tracked-session-status');
const { emitTrackedSessionUpdate } = require('./session-events');

const CODEX_DEFAULT_MODEL = 'gpt-5-codex';
const ACP_PERSIST_DEBOUNCE_MS = 1000;
const STREAM_TEXT_CAP = 50000;

// Stored in configStore as codexThreads for backward compatibility with existing installs.
let trackedThreads = [];

class CodexService {
  constructor() {
    this._persistTimer = null;
  }

  getExecutable() {
    const cli = configStore.getSetting('cliCommands') || {};
    const custom = typeof cli?.codex === 'string' ? cli.codex.trim() : '';
    if (custom) return custom;
    return process.platform === 'win32' ? 'codex.cmd' : 'codex';
  }

  async isCodexInstalled() {
    const cached = installStatus.getCached('codex');
    if (cached !== undefined) {
      return cached;
    }
    return this.refreshInstallStatus();
  }

  isCodexInstalledSync() {
    const cached = installStatus.getCached('codex');
    return cached === undefined ? false : cached;
  }

  async refreshInstallStatus() {
    if (isCommandRunnable(this.getExecutable())) {
      installStatus.setCached('codex', true);
      return true;
    }
    // A bare ~/.codex can be created by tooling that never ran the CLI
    // (e.g. LSP installs); require real Codex data or a runnable binary.
    const home = os.homedir();
    const candidates = [
      path.join(home, '.codex', 'sessions'),
      path.join(home, '.codex', 'config.toml'),
      path.join(home, '.codex', 'auth.json'),
    ];
    const installed = await pathExistsAny(candidates);
    installStatus.setCached('codex', installed);
    return installed;
  }

  setTrackedThreads(threads) {
    const { sessions: next, changed } = reconcileOrphanRunningSessions(threads || [], {
      hasLiveSession: (id) => acpService.hasLiveSession(id),
    });
    trackedThreads = next;
    if (changed) {
      configStore.setCodexThreads(trackedThreads);
    }
  }

  getTrackedThreads() {
    return trackedThreads;
  }

  trackThread(id, metadata = {}) {
    const record = {
      id,
      type: metadata.type || 'response',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: metadata.status || 'completed',
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      branch: metadata.branch || null,
      title: metadata.title || null,
      responseText: metadata.responseText || null,
      projectPath: metadata.projectPath || null,
      ...metadata,
    };

    trackedThreads = upsertItem(trackedThreads, record, { limit: 100 });
    return record;
  }

  getAllAgents() {
    return trackedThreads.map((record) => this.normalizeRecord(record));
  }

  normalizeRecord(record = {}) {
    return {
      id: `codex-${record.id}`,
      provider: 'codex',
      name: record.title || this.extractRecordName(record),
      status: this.mapStatus(record.status),
      prompt: record.prompt || '',
      repository: record.repository || record.projectPath || null,
      branch: record.branch || null,
      prUrl: record.prUrl || null,
      createdAt: record.createdAt ? new Date(record.createdAt) : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt) : null,
      summary: record.responseText || record.status || null,
      rawId: record.id,
      webUrl: null,
      source: record.type || 'response',
    };
  }

  extractRecordName(record) {
    if (record.prompt) {
      return record.prompt.substring(0, 50) + (record.prompt.length > 50 ? '...' : '');
    }
    return `Codex ${String(record.id || '').substring(0, 8)}`;
  }

  mapStatus(status) {
    switch (String(status || '').toLowerCase()) {
      case 'running':
      case 'queued':
      case 'in_progress':
        return 'running';
      case 'completed':
      case 'finished':
        return 'completed';
      case 'failed':
      case 'error':
      case 'cancelled':
      case 'expired':
        return 'failed';
      default:
        return 'pending';
    }
  }

  async getAgentDetails(recordId) {
    const record = trackedThreads.find((t) => t.id === recordId);
    if (!record) {
      throw new Error(`Codex task not found: ${recordId}`);
    }

    const streamMessages = Array.isArray(record.streamMessages) ? record.streamMessages : [];
    const streamHasContent = streamMessages.some(
      (msg) => (msg.content || '').trim() || msg.thinking || (msg.toolCalls?.length ?? 0) > 0
    );

    return {
      ...this.normalizeRecord(record),
      canFollowUp: acpService.canFollowUp(record.id, record),
      messages: [
        {
          id: `${record.id}-prompt`,
          role: 'user',
          content: record.prompt || '',
          createdAt: record.createdAt || null,
        },
        ...(streamHasContent
          ? streamMessages
          : record.responseText
            ? [
                {
                  id: `${record.id}-response`,
                  role: 'assistant',
                  content: record.responseText,
                  createdAt: record.updatedAt || null,
                },
              ]
            : []),
      ],
      runs: [
        {
          id: record.responseId || record.id,
          status: record.status || 'completed',
          model: record.model || CODEX_DEFAULT_MODEL,
          createdAt: record.createdAt || null,
          completedAt: record.updatedAt || null,
        },
      ],
    };
  }

  async startSession(options) {
    const { prompt, projectPath, repository, command } = options;
    const cwd = projectPath || repository;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!cwd) {
      throw new Error('Project path is required');
    }
    if (!(await pathExists(cwd))) {
      throw new Error(`Project path does not exist: ${cwd}`);
    }

    const sessionId = `codex-cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    // An explicit custom CLI command opts out of ACP (it names the CLI itself).
    const adapter =
      command && String(command).trim()
        ? null
        : toAdapterSpec(acpService.resolveAdapter('codex'));

    if (adapter) {
      return this._startAcpSession(adapter, { prompt, projectPath: cwd, model: options.model }, sessionId);
    }
    return this._spawnLegacySession(options, sessionId);
  }

  _startAcpSession(adapter, { prompt, projectPath, model }, sessionId) {
    const record = this.trackThread(sessionId, {
      id: sessionId,
      type: 'cli',
      status: 'running',
      prompt,
      projectPath,
      repository: projectPath,
      title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      model: model || null,
    });
    record.streamText = '';
    record.streamMessages = [];
    this._persistThreads();

    const buildCard = (message) => ({ ...this.normalizeRecord(record), message });

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
                'Codex CLI task started over ACP. Live output streams into the task details.'
              )
            );
          },
          onUpdate: (update) => this._applyAcpUpdate(sessionId, update),
        })
        .then((session) => {
          acpService.registerSession(sessionId, session);
          this._updateTrackedThread(sessionId, {
            acpSessionId: session.sessionId,
            loadSession: session.loadSession,
            model: model || record.model || null,
          });
          return session.prompt(prompt).then(({ stopReason }) => {
            const current = trackedThreads.find((t) => t.id === sessionId);
            const failed = stopReason === 'error' || stopReason === 'cancelled';
            this._updateTrackedThread(sessionId, {
              status: failed ? 'failed' : 'completed',
              responseText: current?.streamText || current?.responseText || null,
              error: failed ? `Codex ACP turn ended with stopReason ${stopReason}` : null,
            });
            resolveOnce(buildCard(failed ? 'failed' : 'completed', 'Codex task finished.'));
          });
        })
        .catch((err) => {
          // Fallback is only legal before any agent work began; after that
          // re-dispatching through the legacy CLI would run the prompt twice.
          if (!cardResolved && err?.fallbackAllowed) {
            acpService.closeSession(sessionId);
            trackedThreads = trackedThreads.filter((t) => t.id !== sessionId);
            this._persistThreads();
            this._spawnLegacySession({ prompt, projectPath }, sessionId).then(
              (card) => resolveOnce(card),
              () => resolveOnce(buildCard(err.message))
            );
            return;
          }
          this._updateTrackedThread(sessionId, {
            status: 'failed',
            error: err?.message || String(err),
          });
          resolveOnce(buildCard(err?.message || 'ACP dispatch failed.'));
        });
    });
  }

  _spawnLegacySession(options, sessionId) {
    const { prompt, projectPath, repository, command, model } = options;
    const cwd = projectPath || repository;

    const codexCmd =
      command && String(command).trim() ? String(command).trim() : this.getExecutable();
    if (!isCommandRunnable(codexCmd)) {
      throw new Error('Codex CLI not found. Install it or set a custom codex executable.');
    }

    const args = ['exec', '--sandbox', 'workspace-write'];
    if (model) {
      args.push('--model', String(model));
    }
    args.push(prompt);

    return new Promise((resolve, reject) => {
      const child = spawnCli(codexCmd, args, {
        cwd,
        detached: true,
        stdio: 'ignore',
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Codex CLI not found. Install it or set a custom codex executable.'));
        } else {
          reject(new Error(`Failed to start Codex CLI: ${err.message}`));
        }
      });

      child.unref();

      const record = this.trackThread(sessionId, {
        id: sessionId,
        type: 'cli',
        status: 'running',
        prompt,
        projectPath: cwd,
        repository: cwd,
        title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      });

      setTimeout(() => {
        resolve({
          ...this.normalizeRecord(record),
          message: 'Codex CLI task started in the background.',
        });
      }, 400);
    });
  }

  _applyAcpUpdate(sessionId, update) {
    const current = trackedThreads.find((t) => t.id === sessionId);
    if (!current) return;
    const nextMessages = applySessionUpdate(
      current.streamMessages || [],
      update,
      new Date().toISOString()
    );
    const text =
      update?.sessionUpdate === 'agent_message_chunk'
        ? typeof update.content === 'string'
          ? update.content
          : update.content?.text
        : null;
    const streamText = text && text.trim()
      ? ((current.streamText || '') + text).slice(-STREAM_TEXT_CAP)
      : current.streamText;
    if (nextMessages === current.streamMessages && streamText === current.streamText) return;
    this._updateTrackedThread(
      sessionId,
      {
        streamText,
        responseText: streamText,
        streamMessages: nextMessages,
      },
      true
    );
  }

  _acpConnectOptions(record) {
    const adapter = toAdapterSpec(acpService.resolveAdapter('codex'));
    if (!adapter) {
      throw new Error('Codex ACP adapter is not available');
    }
    return {
      command: adapter.command,
      args: adapter.args,
      cwd: record.projectPath || record.repository,
      model: record.model,
      permissionPolicy: 'allow-all',
      onUpdate: (update) => this._applyAcpUpdate(record.id, update),
    };
  }

  async sendFollowUp(rawId, message) {
    const record = trackedThreads.find((t) => t.id === rawId);
    if (!record) {
      throw new Error(`Codex task not found: ${rawId}`);
    }
    return sendAcpFollowUp({
      taskId: rawId,
      message,
      getRecord: () => trackedThreads.find((t) => t.id === rawId),
      connectOptions: acpService.hasLiveSession(rawId) ? {} : this._acpConnectOptions(record),
      updateRecord: (patch) => this._updateTrackedThread(rawId, patch),
      failedLabel: 'Codex',
    });
  }

  _updateTrackedThread(threadId, patch, debounced = false) {
    const idx = trackedThreads.findIndex((t) => t.id === threadId);
    if (idx === -1) return;
    const prev = trackedThreads[idx];
    const next = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    trackedThreads[idx] = next;
    if (debounced) {
      this._persistThreadsDebounced();
    } else {
      this._persistThreads();
    }
    const statusChanged = patch.status !== undefined && patch.status !== prev.status;
    if (statusChanged) {
      const mapped = this.mapStatus(next.status);
      emitTrackedSessionUpdate(
        'codex',
        { ...next, id: `codex-${next.id}`, rawId: next.id, status: mapped },
        {
          statusChanged: true,
          details: { status: mapped },
        }
      );
    }
  }

  _persistThreads() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      configStore.setCodexThreads(trackedThreads);
    } catch (err) {
      console.error('Failed to persist Codex threads:', err?.message || err);
    }
  }

  _persistThreadsDebounced() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistThreads();
    }, ACP_PERSIST_DEBOUNCE_MS);
  }

  async createTask(options = {}) {
    if (!(await this.isCodexInstalled())) {
      throw new Error('Codex CLI not installed');
    }
    const repoPath = options.projectPath || options.repository;
    if (!repoPath) {
      throw new Error('Project path is required');
    }
    if (!(await pathExists(repoPath))) {
      throw new Error(`Project path does not exist: ${repoPath}`);
    }
    return this.startSession({ ...options, projectPath: repoPath });
  }

  async getAvailableLocalRepositories(paths = []) {
    const projects = [];
    const scannedPaths = new Set();
    const uniquePaths = [...new Set(paths)];

    const results = await Promise.all(
      uniquePaths.map(async (basePath) => {
        try {
          try {
            await fs.promises.access(basePath);
          } catch {
            return [];
          }

          const entries = await fs.promises.readdir(basePath, { withFileTypes: true });
          const validDirs = entries.filter(
            (entry) =>
              entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules'
          );

          const dirPromises = validDirs.map(async (entry) => {
            const dirPath = path.join(basePath, entry.name);
            const gitPath = path.join(dirPath, '.git');

            try {
              await fs.promises.access(gitPath);
              return {
                id: dirPath,
                name: entry.name,
                url: dirPath,
                path: dirPath,
                displayName: entry.name,
              };
            } catch {
              return null;
            }
          });

          return Promise.all(dirPromises);
        } catch (err) {
          console.error(`Error scanning ${basePath}:`, err);
          return [];
        }
      })
    );

    const allProjects = results.flat().filter((p) => p !== null);
    for (const project of allProjects) {
      if (!scannedPaths.has(project.path)) {
        scannedPaths.add(project.path);
        projects.push(project);
      }
    }

    return projects;
  }

  async getAvailableProjects(localPaths = []) {
    const repos = new Map();

    for (const record of trackedThreads) {
      const repo = record.repository || record.projectPath;
      if (repo) {
        repos.set(repo, {
          id: repo,
          name: repo,
          displayName: repo,
        });
      }
    }

    const localRepos = await this.getAvailableLocalRepositories(localPaths);
    for (const repo of localRepos) {
      if (!repos.has(repo.path)) {
        repos.set(repo.path, repo);
      }
    }

    return Array.from(repos.values());
  }
}

module.exports = new CodexService();
