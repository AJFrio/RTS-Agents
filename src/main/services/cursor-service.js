const fs = require('fs');
const path = require('path');
const httpService = require('./http-service');
const providerHealth = require('./provider-health');

const BASE_URL = 'https://api.cursor.com/v1';

class CursorService {
  constructor() {
    this.apiKey = null;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  async request(endpoint, method = 'GET', body = null) {
    if (!this.apiKey) {
      throw new Error('Cursor API key not configured');
    }

    const auth = Buffer.from(`${this.apiKey}:`).toString('base64');

    try {
      return await httpService.requestJson(`${BASE_URL}${endpoint}`, method, body, {
        'Authorization': `Basic ${auth}`
      }, 60000);
    } catch (err) {
      if (err.statusCode) {
        const dataStr = typeof err.data === 'object' ? JSON.stringify(err.data) : err.data;
        throw new Error(`Cursor API error: ${err.statusCode} - ${dataStr}`);
      }
      throw err;
    }
  }

  async listAgents(limit = 100, cursor = null) {
    let endpoint = `/agents?limit=${limit}`;
    if (cursor) {
      endpoint += `&cursor=${cursor}`;
    }
    return this.request(endpoint);
  }

  async getAgent(agentId) {
    return this.request(`/agents/${agentId}`);
  }

  async listRuns(agentId, limit = 20, cursor = null) {
    let endpoint = `/agents/${agentId}/runs?limit=${limit}`;
    if (cursor) {
      endpoint += `&cursor=${cursor}`;
    }
    return this.request(endpoint);
  }

  async getRun(agentId, runId) {
    return this.request(`/agents/${agentId}/runs/${runId}`);
  }

  async getAllAgents() {
    const response = await this.listAgents(100);
    const agents = response.items || response.agents || [];
    const settled = await Promise.allSettled(
      agents.map(async (agent) => {
        const run = agent.latestRunId
          ? await this.getRun(agent.id, agent.latestRunId).catch(() => null)
          : null;
        return this.normalizeAgent(agent, run);
      })
    );

    return settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  normalizeAgent(agent, run = null) {
    const pushedBranch = run?.git?.branches?.find((entry) => entry.branch);
    const pullRequest = run?.git?.branches?.find((entry) => entry.prUrl);
    const repository = agent.repos?.[0]?.url || agent.source?.repository || null;

    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: this.mapStatus(run?.status || agent.status),
      prompt: '',
      repository,
      branch: pushedBranch?.branch || agent.repos?.[0]?.startingRef || agent.target?.branchName || null,
      prUrl: pullRequest?.prUrl || agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt: (run?.updatedAt || agent.updatedAt) ? new Date(run?.updatedAt || agent.updatedAt) : null,
      summary: run?.result || agent.summary || null,
      rawId: agent.id,
      webUrl: agent.url || `https://cursor.com/agents/${agent.id}`,
      url: agent.url || agent.target?.url || null,
      ref: agent.repos?.[0]?.startingRef || agent.source?.ref || null,
      autoCreatePr: agent.autoCreatePR || agent.target?.autoCreatePr || false,
      latestRunId: agent.latestRunId || run?.id || null
    };
  }

  mapStatus(status) {
    if (!status) return 'pending';

    const statusMap = {
      CREATING: 'pending',
      RUNNING: 'running',
      FINISHED: 'completed',
      ERROR: 'failed',
      CANCELLED: 'stopped',
      EXPIRED: 'failed',
      STOPPED: 'stopped',
      ACTIVE: 'running',
      ARCHIVED: 'stopped'
    };

    return statusMap[String(status).toUpperCase()] || 'pending';
  }

  async getAgentDetails(agentId) {
    const agent = await this.getAgent(agentId);
    const runsResponse = await this.listRuns(agentId, 20).catch(() => ({ items: [] }));
    const runs = runsResponse.items || [];
    const latestRun = agent.latestRunId
      ? await this.getRun(agentId, agent.latestRunId).catch(() => runs[0] || null)
      : runs[0] || null;

    return {
      ...this.normalizeAgent(agent, latestRun),
      conversation: latestRun?.result ? [{
        id: latestRun.id,
        type: 'assistant_message',
        text: latestRun.result,
        isUser: false
      }] : [],
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        result: run.result || null,
        git: run.git || null
      }))
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
        diagnostics: { apiKeyName: info?.apiKeyName || null, userEmail: info?.userEmail || null }
      });
    } catch (err) {
      return providerHealth.fail('cursor', err, {
        configured: !!this.apiKey,
        docsUrl: 'https://cursor.com/docs/cloud-agent/api/endpoints',
        endpointLabel: 'GET /v1/me'
      });
    }
  }

  async getAvailableLocalRepositories(paths = []) {
    const scannedPaths = new Set();
    const uniquePaths = [...new Set(paths)];

    const pathResults = await Promise.all(uniquePaths.map(async (basePath) => {
      try {
        const stats = await fs.promises.stat(basePath).catch(() => null);
        if (!stats || !stats.isDirectory()) return [];

        const entries = await fs.promises.readdir(basePath, { withFileTypes: true });

        const entryResults = await Promise.all(entries.map(async (entry) => {
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
              displayName: entry.name
            };
          } catch {
            return null;
          }
        }));

        return entryResults.filter(Boolean);
      } catch (err) {
        console.error(`Error scanning ${basePath}:`, err);
        return [];
      }
    }));

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

        cloudRepos = repos.map(repo => ({
          id: repo.url || repo.repository,
          name: repo.name || this.extractRepoName(repo.url || repo.repository),
          url: repo.url || repo.repository,
          defaultBranch: repo.defaultBranch || 'main',
          displayName: this.extractRepoName(repo.url || repo.repository)
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
        text: prompt
      },
      repos: [{
        url: repository,
        startingRef: branchName || ref
      }],
      autoCreatePR: autoCreatePr
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

    return this.request(`/agents/${agentId}/runs`, 'POST', {
      prompt: {
        text: message
      }
    });
  }
}

module.exports = new CursorService();
