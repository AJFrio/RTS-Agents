const fs = require('fs');
const path = require('path');
const httpService = require('./http-service');
const providerHealth = require('./provider-health');
const acpService = require('./acp-service');
const configStore = require('./config-store');
const { toAdapterSpec } = require('../utils/cli-spawn');
const { applySessionUpdate } = require('./opencode-session-parser');
const { sendAcpFollowUp } = require('./acp-follow-up');
const { reconcileOrphanRunningSessions } = require('../utils/tracked-session-status');
const { emitTrackedSessionUpdate } = require('./session-events');

// Cloud Agents API v1 (replaced v0). There is no Cloud v2 as of 2026-09.
const BASE_URL = 'https://api.cursor.com/v1';
const ACP_PERSIST_DEBOUNCE_MS = 1000;
const TRACKED_CURSOR_SESSION_LIMIT = 100;

class CursorService {
  constructor() {
    this.apiKey = null;
    this.trackedCliSessions = [];
    this._persistTimer = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  setCursorCliSessions(sessions) {
    const { sessions: next, changed } = reconcileOrphanRunningSessions(
      Array.isArray(sessions) ? sessions : [],
      { hasLiveSession: (id) => acpService.hasLiveSession(id) }
    );
    this.trackedCliSessions = next;
    if (changed) {
      configStore.setCursorCliSessions(this.trackedCliSessions);
    }
  }

  getCursorCliSessions() {
    return this.trackedCliSessions;
  }

  isCursorCliAvailable() {
    return !!toAdapterSpec(acpService.resolveAdapter('cursor'), ['acp']);
  }

  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('Cursor API key not configured');
    }

    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');

    try {
      return await httpService.requestJson(
        `${BASE_URL}${endpoint}`,
        method,
        body,
        {
          Authorization: `Basic ${auth}`,
        },
        60000
      );
    } catch (err) {
      if (err.statusCode) {
        const dataStr = typeof err.data === 'object' ? JSON.stringify(err.data) : err.data;
        throw new Error(`Cursor API error: ${err.statusCode} - ${dataStr}`);
      }
      throw err;
    }
  }

  async listAgents(limit = 100, cursor = null) {
    let endpoint = `/agents?limit=${encodeURIComponent(limit)}`;
    if (cursor) {
      endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    }
    return this.request(endpoint);
  }

  resolveAgentId(agentId) {
    if (!agentId) {
      throw new Error('Cursor agent ID is required');
    }
    return String(agentId).replace(/^cursor-/, '');
  }

  unwrapAgent(response) {
    if (!response) return null;
    return response.agent || response;
  }

  async getAgent(agentId) {
    const id = this.resolveAgentId(agentId);
    const response = await this.request(`/agents/${encodeURIComponent(id)}`);
    return this.unwrapAgent(response);
  }

  async listRuns(agentId, limit = 20, cursor = null) {
    const id = this.resolveAgentId(agentId);
    let endpoint = `/agents/${encodeURIComponent(id)}/runs?limit=${encodeURIComponent(limit)}`;
    if (cursor) {
      endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    }
    return this.request(endpoint);
  }

  async getRun(agentId, runId) {
    const id = this.resolveAgentId(agentId);
    const response = await this.request(
      `/agents/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`
    );
    return this.unwrapRun(response);
  }

  async getAllAgents() {
    const agents = this.trackedCliSessions.map((record) => this._normalizeTrackedCli(record));

    if (this.apiKey) {
      try {
        agents.push(...(await this._listCloudAgents()));
      } catch (err) {
        // Surface local sessions even when the cloud listing fails
      }
    }

    return agents;
  }

  async _listCloudAgents() {
    const response = await this.listAgents(100);
    const agents = this.extractListItems(response).map((item) => this.unwrapAgent(item));
    const settled = await Promise.allSettled(
      agents.map(async (agent) => {
        const run = await this.getLatestRun(agent);
        return this.normalizeAgent(agent, run);
      })
    );

    return settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  }

  async getLatestRun(agent) {
    const agentRecord = this.unwrapAgent(agent);
    if (!agentRecord?.id) return null;

    if (agentRecord.latestRunId) {
      const run = await this.getRun(agentRecord.id, agentRecord.latestRunId).catch(() => null);
      if (run) return run;
    }

    const runsResponse = await this.listRuns(agentRecord.id, 1).catch(() => null);
    const runs = this.extractListItems(runsResponse);
    return this.unwrapRun(runs[0] || null);
  }

  extractListItems(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    return response.items || response.agents || response.runs || response.repositories || [];
  }

  unwrapRun(response) {
    if (!response) return null;
    return response.run || response;
  }

  normalizeAgent(agent, run = null) {
    const pushedBranch = run?.git?.branches?.find((entry) => entry.branch);
    const pullRequest = run?.git?.branches?.find((entry) => entry.prUrl);
    const repository = agent.repos?.[0]?.url || agent.source?.repository || null;

    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: run
        ? this.mapRunStatus(run.status)
        : this.mapAgentStatus(agent.status, !!agent.latestRunId),
      prompt: '',
      repository,
      branch:
        pushedBranch?.branch || agent.repos?.[0]?.startingRef || agent.target?.branchName || null,
      prUrl: pullRequest?.prUrl || agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt:
        run?.updatedAt || agent.updatedAt ? new Date(run?.updatedAt || agent.updatedAt) : null,
      summary: run?.result || agent.summary || null,
      rawId: agent.id,
      webUrl: agent.url || `https://cursor.com/agents/${agent.id}`,
      url: agent.url || agent.target?.url || null,
      ref: agent.repos?.[0]?.startingRef || agent.source?.ref || null,
      autoCreatePr: agent.autoCreatePR || agent.target?.autoCreatePr || false,
      latestRunId: agent.latestRunId || run?.id || null,
    };
  }

  mapRunStatus(status) {
    if (!status) return 'pending';

    const statusMap = {
      CREATING: 'pending',
      RUNNING: 'running',
      FINISHED: 'completed',
      ERROR: 'failed',
      FAILED: 'failed',
      CANCELLED: 'stopped',
      EXPIRED: 'failed',
      STOPPED: 'stopped',
    };

    return statusMap[String(status).toUpperCase()] || 'pending';
  }

  mapAgentStatus(status, hasRun = false) {
    if (!status) return hasRun ? 'completed' : 'pending';

    const statusMap = {
      ACTIVE: hasRun ? 'completed' : 'pending',
      ARCHIVED: 'stopped',
      CREATING: 'pending',
      RUNNING: 'running',
      FINISHED: 'completed',
      ERROR: 'failed',
      FAILED: 'failed',
      CANCELLED: 'stopped',
      EXPIRED: 'failed',
      STOPPED: 'stopped',
    };

    return statusMap[String(status).toUpperCase()] || (hasRun ? 'completed' : 'pending');
  }

  mergeRunSummary(listRun, detailRun) {
    if (!listRun) return detailRun;
    if (!detailRun) return listRun;
    return {
      ...listRun,
      ...detailRun,
      git: detailRun.git || listRun.git || null,
    };
  }

  formatRunGitDescription(run) {
    const branches = run?.git?.branches || [];
    if (!branches.length) return null;

    return branches
      .map((entry) => {
        const parts = [];
        if (entry.repoUrl) parts.push(entry.repoUrl);
        if (entry.branch) parts.push(`branch: ${entry.branch}`);
        if (entry.prUrl) parts.push(`PR: ${entry.prUrl}`);
        return parts.join(' · ');
      })
      .filter(Boolean)
      .join('\n');
  }

  buildRunActivity(run) {
    const gitNote = this.formatRunGitDescription(run);
    const description = [run.result, gitNote].filter(Boolean).join('\n\n') || null;

    return {
      id: run.id,
      type: 'cursor_run',
      title: `Run ${run.status || 'UNKNOWN'}`,
      description,
      timestamp: run.updatedAt || run.createdAt,
    };
  }

  buildConversationFromRuns(runs) {
    const chronological = [...runs].reverse();
    const messages = [];

    for (const run of chronological) {
      if (!run?.result || !String(run.result).trim()) continue;
      messages.push({
        id: run.id,
        type: 'assistant_message',
        text: run.result,
        isUser: false,
      });
    }

    return messages;
  }

  async hydrateRuns(agentId, runs) {
    const settled = await Promise.allSettled(
      runs.map((run) => (run?.id ? this.getRun(agentId, run.id) : Promise.resolve(null)))
    );

    return runs.map((run, index) => {
      const settledEntry = settled[index];
      const detail = settledEntry.status === 'fulfilled' ? settledEntry.value : null;
      return this.mergeRunSummary(run, detail);
    });
  }

  async getAgentDetails(agentId) {
    if (String(agentId).startsWith('cursor-cli-')) {
      const tracked = this.trackedCliSessions.find((s) => s.id === agentId);
      if (!tracked) {
        throw new Error(`Cursor task not found: ${agentId}`);
      }
      return this._getTrackedCliDetails(tracked);
    }

    const id = this.resolveAgentId(agentId);
    const agent = await this.getAgent(id);

    let runsResponse;
    try {
      runsResponse = await this.listRuns(id, 20);
    } catch (err) {
      console.warn(`Cursor listRuns failed for ${id}:`, err.message);
      runsResponse = { items: [] };
    }

    const listRuns = this.extractListItems(runsResponse)
      .map((run) => this.unwrapRun(run))
      .filter(Boolean);
    const runs = await this.hydrateRuns(id, listRuns);

    const latestRunId = agent.latestRunId || runs[0]?.id || null;
    const latestRun = runs.find((run) => run?.id === latestRunId) || runs[0] || null;

    const terminalRunsWithResult = runs.filter((run) => run?.result && String(run.result).trim());
    const summary = latestRun?.result || terminalRunsWithResult[0]?.result || agent.name || null;

    const activities = runs.map((run) => this.buildRunActivity(run));
    const conversation = this.buildConversationFromRuns(runs);

    return {
      ...this.normalizeAgent(agent, latestRun),
      summary,
      activities,
      conversation,
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        durationMs: run.durationMs ?? null,
        result: run.result || null,
        git: run.git || null,
      })),
    };
  }

  async getApiKeyInfo() {
    return this.request('/me');
  }

  async listModels() {
    return this.request('/models');
  }

  async listRepositories() {
    return this.request('/repositories');
  }

  async testConnection() {
    try {
      const info = await this.getApiKeyInfo();
      return providerHealth.ok('cursor', {
        configured: true,
        docsUrl: 'https://cursor.com/docs/cloud-agent/api/endpoints',
        endpointLabel: 'GET /v1/me',
        message: `Connected to Cursor${info?.userEmail ? ` as ${info.userEmail}` : ''}.`,
        diagnostics: { apiKeyName: info?.apiKeyName || null, userEmail: info?.userEmail || null },
      });
    } catch (err) {
      return providerHealth.fail('cursor', err, {
        configured: !!this.apiKey,
        docsUrl: 'https://cursor.com/docs/cloud-agent/api/endpoints',
        endpointLabel: 'GET /v1/me',
      });
    }
  }

  async getAvailableLocalRepositories(paths = []) {
    const scannedPaths = new Set();
    const uniquePaths = [...new Set(paths)];

    const pathResults = await Promise.all(
      uniquePaths.map(async (basePath) => {
        try {
          const stats = await fs.promises.stat(basePath).catch(() => null);
          if (!stats || !stats.isDirectory()) return [];

          const entries = await fs.promises.readdir(basePath, { withFileTypes: true });

          const entryResults = await Promise.all(
            entries.map(async (entry) => {
              if (!entry.isDirectory()) return null;
              if (entry.name.startsWith('.') || entry.name === 'node_modules') return null;

              const dirPath = path.join(basePath, entry.name);
              const gitPath = path.join(dirPath, '.git');

              try {
                await fs.promises.access(gitPath);
                return {
                  id: dirPath,
                  name: entry.name,
                  url: dirPath,
                  path: dirPath,
                  defaultBranch: 'main',
                  displayName: entry.name,
                };
              } catch {
                return null;
              }
            })
          );

          return entryResults.filter(Boolean);
        } catch (err) {
          console.error(`Error scanning ${basePath}:`, err);
          return [];
        }
      })
    );

    const projects = [];
    const flattened = pathResults.flat();

    for (const project of flattened) {
      if (!scannedPaths.has(project.path)) {
        scannedPaths.add(project.path);
        projects.push(project);
      }
    }

    return projects;
  }

  async getAllRepositories(localPaths = []) {
    let cloudRepos = [];
    try {
      if (this.apiKey) {
        const response = await this.listRepositories();
        const repos = response.items || response.repositories || response || [];

        cloudRepos = repos.map((repo) => ({
          id: repo.url || repo.repository,
          name: repo.name || this.extractRepoName(repo.url || repo.repository),
          url: repo.url || repo.repository,
          defaultBranch: repo.defaultBranch || 'main',
          displayName: this.extractRepoName(repo.url || repo.repository),
        }));
      }
    } catch (err) {
      console.warn('Error fetching Cursor cloud repositories:', err.message);
    }

    const localRepos = await this.getAvailableLocalRepositories(localPaths);
    return [...cloudRepos, ...localRepos];
  }

  extractRepoName(url) {
    if (!url) return 'Unknown';
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : url;
  }

  // ============================================
  // Local CLI dispatch (ACP)
  // ============================================

  /**
   * Start a local Cursor CLI task over ACP (`agent acp` / legacy
   * `cursor-agent acp`). Auth reuses the CLI's own stored Cursor login.
   * There is no detached-CLI fallback for Cursor: pre-start ACP failures
   * reject so the UI can surface them.
   * @param {object} options
   * @param {string} options.prompt - The task description/prompt
   * @param {string} [options.projectPath] - Path to the project directory
   */
  async startCliSession(options) {
    const { prompt } = options;
    const projectPath = options.projectPath || options.repository;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!projectPath) {
      throw new Error('Project path is required');
    }

    try {
      await fs.promises.access(projectPath);
    } catch {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const adapter = toAdapterSpec(acpService.resolveAdapter('cursor'), ['acp']);
    if (!adapter) {
      throw new Error(
        'Cursor CLI not found. Install it from https://cursor.com/cli and run "agent login" once.'
      );
    }

    const sessionId = `cursor-cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return this._startAcpSession(adapter, { prompt, projectPath, model: options.model }, sessionId);
  }

  _startAcpSession(adapter, { prompt, projectPath, model }, sessionId) {
    const record = {
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
    this.trackedCliSessions = [record, ...this.trackedCliSessions].slice(
      0,
      TRACKED_CURSOR_SESSION_LIMIT
    );
    this._persistTrackedCliSessions();

    const buildCard = (status, message) => ({
      id: sessionId,
      provider: 'cursor',
      source: 'local',
      name: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      status,
      prompt,
      repository: projectPath,
      createdAt: new Date(),
      message,
    });

    return new Promise((resolveCard, rejectCard) => {
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
          authMethodId: 'cursor_login',
          permissionPolicy: 'allow-all',
          onSessionId: () => {
            resolveOnce(
              buildCard(
                'running',
                'Cursor CLI task started over ACP. Live output streams into the task details.'
              )
            );
          },
          onUpdate: (update) => this._applyAcpUpdate(sessionId, update),
        })
        .then((session) => {
          acpService.registerSession(sessionId, session);
          this._updateTrackedCliSession(sessionId, {
            acpSessionId: session.sessionId,
            loadSession: session.loadSession,
          });
          return session.prompt(prompt).then(({ stopReason }) => {
            const failed = stopReason === 'error' || stopReason === 'cancelled';
            this._updateTrackedCliSession(sessionId, {
              status: failed ? 'failed' : 'completed',
              error: failed ? `Cursor ACP turn ended with stopReason ${stopReason}` : null,
            });
            resolveOnce(buildCard(failed ? 'failed' : 'completed', 'Cursor task finished.'));
          });
        })
        .catch((err) => {
          if (!cardResolved) {
            acpService.closeSession(sessionId);
            this.trackedCliSessions = this.trackedCliSessions.filter((s) => s.id !== sessionId);
            this._persistTrackedCliSessions();
            rejectCard(err);
            return;
          }
          this._updateTrackedCliSession(sessionId, {
            status: 'failed',
            error: err?.message || String(err),
          });
          resolveOnce(buildCard('failed', err?.message || 'ACP dispatch failed.'));
        });
    });
  }

  _applyAcpUpdate(sessionId, update) {
    const current = this.trackedCliSessions.find((s) => s.id === sessionId);
    if (!current) return;
    const next = applySessionUpdate(current.streamMessages || [], update, new Date().toISOString());
    if (next === current.streamMessages) return;
    this._updateTrackedCliSession(sessionId, { streamMessages: next }, true);
  }

  _acpConnectOptions(record) {
    const adapter = toAdapterSpec(acpService.resolveAdapter('cursor'), ['acp']);
    if (!adapter) {
      throw new Error(
        'Cursor CLI not found. Install it from https://cursor.com/cli and run "agent login" once.'
      );
    }
    return {
      command: adapter.command,
      args: adapter.args,
      cwd: record.projectPath,
      model: record.model,
      authMethodId: 'cursor_login',
      permissionPolicy: 'allow-all',
      onUpdate: (update) => this._applyAcpUpdate(record.id, update),
    };
  }

  async sendCliFollowUp(rawId, message) {
    const record = this.trackedCliSessions.find((s) => s.id === rawId);
    if (!record) {
      throw new Error(`Cursor task not found: ${rawId}`);
    }
    return sendAcpFollowUp({
      taskId: rawId,
      message,
      getRecord: () => this.trackedCliSessions.find((s) => s.id === rawId),
      connectOptions: acpService.hasLiveSession(rawId) ? {} : this._acpConnectOptions(record),
      updateRecord: (patch) => this._updateTrackedCliSession(rawId, patch),
      failedLabel: 'Cursor',
    });
  }

  _updateTrackedCliSession(sessionId, patch, debounced = false) {
    const idx = this.trackedCliSessions.findIndex((x) => x.id === sessionId);
    if (idx === -1) return;
    const prev = this.trackedCliSessions[idx];
    const next = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.trackedCliSessions[idx] = next;
    if (debounced) {
      this._persistTrackedCliSessionsDebounced();
    } else {
      this._persistTrackedCliSessions();
    }
    const statusChanged = patch.status !== undefined && patch.status !== prev.status;
    if (statusChanged) {
      emitTrackedSessionUpdate('cursor', next, {
        statusChanged: true,
        details: this._getTrackedCliDetails(next),
      });
    }
  }

  _persistTrackedCliSessions() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      configStore.setCursorCliSessions(this.trackedCliSessions);
    } catch (err) {
      console.error('Failed to persist Cursor CLI sessions:', err?.message || err);
    }
  }

  _persistTrackedCliSessionsDebounced() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
    }
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._persistTrackedCliSessions();
    }, ACP_PERSIST_DEBOUNCE_MS);
  }

  _normalizeTrackedCli(record) {
    const stream = Array.isArray(record.streamMessages) ? record.streamMessages : [];
    const lastContent = stream.length ? String(stream[stream.length - 1].content || '') : '';
    return {
      id: record.id,
      provider: 'cursor',
      source: 'local',
      name: record.prompt
        ? record.prompt.substring(0, 50) + (record.prompt.length > 50 ? '...' : '')
        : 'Cursor CLI Session',
      status: record.status || 'running',
      prompt: record.prompt || '',
      repository: record.projectPath || null,
      createdAt: record.createdAt ? new Date(record.createdAt) : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt) : null,
      summary: lastContent ? lastContent.substring(0, 200) : null,
      rawId: record.id,
      messageCount: stream.length + 1,
    };
  }

  _getTrackedCliDetails(record) {
    const stream = Array.isArray(record.streamMessages) ? record.streamMessages : [];
    return {
      name: record.prompt ? record.prompt.substring(0, 80) : 'Cursor CLI Session',
      prompt: record.prompt || '',
      summary: this._normalizeTrackedCli(record).summary,
      status: record.status || 'running',
      source: 'local',
      canFollowUp: acpService.canFollowUp(record.id, record),
      repository: record.projectPath || null,
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      messages: [
        {
          id: 'prompt',
          role: 'user',
          content: record.prompt || '',
          timestamp: record.createdAt || null,
        },
        ...stream.map((msg) => ({
          id: msg.id || null,
          role: msg.role || 'assistant',
          content: msg.content || '',
          timestamp: msg.timestamp || null,
          ...(msg.thinking ? { thinking: msg.thinking } : {}),
          ...(Array.isArray(msg.toolCalls) ? { toolCalls: msg.toolCalls } : {}),
        })),
      ],
    };
  }

  async createAgent(options) {
    const { prompt, repository, ref = 'main', autoCreatePr = true, branchName, model } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!repository) {
      throw new Error('Repository is required');
    }

    const body = {
      prompt: {
        text: prompt,
      },
      repos: [
        {
          url: repository,
          startingRef: branchName || ref,
        },
      ],
      autoCreatePR: autoCreatePr,
    };

    if (model) {
      body.model = { id: model };
    }

    const response = await this.request('/agents', 'POST', body);
    return this.normalizeAgent(response.agent || response, response.run || null);
  }

  async addFollowUp(agentId, message) {
    if (!message) {
      throw new Error('Message is required');
    }

    const id = this.resolveAgentId(agentId);
    const response = await this.request(`/agents/${encodeURIComponent(id)}/runs`, 'POST', {
      prompt: {
        text: message,
      },
    });
    return this.unwrapRun(response);
  }
}

module.exports = new CursorService();
