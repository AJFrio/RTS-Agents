const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const { upsertItem } = require('../utils/collection-utils');
const httpService = require('./http-service');
const configStore = require('./config-store');
const { pathExists, pathExistsAny } = require('../utils/path-exists');
const installStatus = require('../utils/install-status');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');

const BASE_URL = 'https://api.openai.com/v1';
const CODEX_DEFAULT_MODEL = 'gpt-5-codex';
const ACP_PERSIST_DEBOUNCE_MS = 1000;
const STREAM_TEXT_CAP = 50000;

// Stored in configStore as codexThreads for backward compatibility with existing installs.
let trackedThreads = [];

function isCommandRunnable(cmd, args = ['--version']) {
  if (!cmd) return false;
  try {
    const r = spawnSync(String(cmd), args, {
      shell: false,
      stdio: 'ignore',
      timeout: 3000,
      windowsHide: true,
    });
    if (r.error) return false;
    return r.status === 0;
  } catch {
    return false;
  }
}

class CodexService {
  constructor() {
    this.apiKey = null;
    this._persistTimer = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
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

  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const url = `${BASE_URL}${endpoint}`;

    try {
      return await httpService.requestJson(
        url,
        method,
        body,
        {
          Authorization: `Bearer ${this.apiKey}`,
        },
        60000
      );
    } catch (err) {
      if (err.statusCode) {
        const dataStr = typeof err.data === 'object' ? JSON.stringify(err.data) : err.data;
        throw new Error(`OpenAI API error: ${err.statusCode} - ${dataStr}`);
      }
      throw err;
    }
  }

  async listModels() {
    return this.request('/models');
  }

  async testConnection() {
    try {
      const response = await this.listModels();
      const models = Array.isArray(response?.data) ? response.data : [];
      const codexModels = models.filter((model) => String(model?.id || '').includes('codex'));
      return providerHealth.ok('codex', {
        configured: true,
        installed: await this.isCodexInstalled(),
        docsUrl: 'https://developers.openai.com/api/docs/guides/migrate-to-responses',
        endpointLabel: 'GET /v1/models',
        message: `Connected to OpenAI. ${codexModels.length} Codex-capable model${codexModels.length === 1 ? '' : 's'} found.`,
        diagnostics: { modelCount: models.length, codexModelCount: codexModels.length },
      });
    } catch (err) {
      return providerHealth.fail('codex', err, {
        configured: !!this.apiKey,
        installed: await this.isCodexInstalled(),
        docsUrl: 'https://developers.openai.com/api/docs/guides/migrate-to-responses',
        endpointLabel: 'GET /v1/models',
      });
    }
  }

  setTrackedThreads(threads) {
    trackedThreads = threads || [];
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
      webUrl: record.responseId
        ? `https://platform.openai.com/logs/response/${record.responseId}`
        : null,
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

    return {
      ...this.normalizeRecord(record),
      messages: [
        {
          id: `${record.id}-prompt`,
          role: 'user',
          content: record.prompt || '',
          createdAt: record.createdAt || null,
        },
        ...(record.responseText
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

  async createResponse(options = {}) {
    const { prompt, repository, branch, title, model = CODEX_DEFAULT_MODEL, attachments } = options;
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    let input = prompt;
    if (repository) input += `\n\nRepository context: ${repository}`;
    if (branch) input += `\nBranch: ${branch}`;
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      input += `\n\nAttachments were provided as data URLs. Review them only if the selected model supports image inputs.`;
      for (const attachment of attachments) {
        if (attachment?.dataUrl) {
          input += `\n${attachment.name || 'Image'}: ${attachment.dataUrl}`;
        }
      }
    }

    const response = await this.request('/responses', 'POST', {
      model,
      input,
      store: true,
      metadata: {
        title: title || prompt.substring(0, 50),
        repository: repository || '',
        branch: branch || '',
      },
    });

    const id = response.id || `response-${Date.now()}`;
    const record = this.trackThread(id, {
      id,
      type: 'response',
      responseId: response.id,
      prompt,
      repository,
      branch,
      title: title || prompt.substring(0, 50),
      model,
      status: response.status || 'completed',
      responseText: response.output_text || this.extractResponseText(response),
    });

    return this.normalizeRecord(record);
  }

  extractResponseText(response) {
    const output = Array.isArray(response?.output) ? response.output : [];
    return (
      output
        .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
        .map((content) => content?.text || '')
        .filter(Boolean)
        .join('\n') || null
    );
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
      command && String(command).trim() ? null : acpService.resolveAdapter('codex');

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
    });
    record.streamText = '';
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
        .runPrompt({
          command: adapter,
          cwd: projectPath,
          prompt,
          model,
          permissionPolicy: 'allow-all',
          onSessionId: () => {
            resolveOnce(
              buildCard(
                'Codex CLI task started over ACP. Live output streams into the task details.'
              )
            );
          },
          onUpdate: (update) => {
            if (update?.sessionUpdate !== 'agent_message_chunk') return;
            const text =
              typeof update.content === 'string' ? update.content : update.content?.text;
            if (!text || !text.trim()) return;
            record.streamText = (record.streamText + text).slice(-STREAM_TEXT_CAP);
            record.responseText = record.streamText;
            this._updateTrackedThread(sessionId, { responseText: record.streamText }, true);
          },
        })
        .then(({ stopReason }) => {
          const failed = stopReason === 'error' || stopReason === 'cancelled';
          this._updateTrackedThread(sessionId, {
            status: failed ? 'failed' : 'completed',
            responseText: record.streamText || null,
            error: failed ? `Codex ACP turn ended with stopReason ${stopReason}` : null,
          });
          resolveOnce(buildCard(failed ? 'failed' : 'completed', 'Codex task finished.'));
        })
        .catch((err) => {
          // Fallback is only legal before any agent work began; after that
          // re-dispatching through the legacy CLI would run the prompt twice.
          if (!cardResolved && err?.fallbackAllowed) {
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
      const child = spawn(codexCmd, args, {
        cwd,
        shell: false,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
        windowsHide: true,
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

  _updateTrackedThread(threadId, patch, debounced = false) {
    const idx = trackedThreads.findIndex((t) => t.id === threadId);
    if (idx === -1) return;
    trackedThreads[idx] = {
      ...trackedThreads[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (debounced) {
      this._persistThreadsDebounced();
    } else {
      this._persistThreads();
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
    const repoPath = options.projectPath || options.repository;
    if (repoPath && (await pathExists(repoPath)) && (await this.isCodexInstalled())) {
      return this.startSession({ ...options, projectPath: repoPath });
    }
    return this.createResponse(options);
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
