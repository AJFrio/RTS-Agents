/**
 * Cursor Cloud API Service
 * Port of the Electron app's Cursor service for web/mobile
 */

import type { Activity, AgentTask, AgentDetails, Repository, ConversationMessage } from '../store/types';

const BASE_URL = '/api/cursor';

interface CursorAgent {
  id: string;
  name?: string;
  status?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
  url?: string;
  repos?: Array<{
    url?: string;
    startingRef?: string;
    prUrl?: string;
  }>;
  source?: {
    repository?: string;
    ref?: string;
  };
  target?: {
    branchName?: string;
    prUrl?: string;
    url?: string;
    autoCreatePr?: boolean;
  };
}

interface CursorRun {
  id: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  result?: string;
  git?: {
    branches?: Array<{
      repoUrl?: string;
      branch?: string;
      prUrl?: string;
    }>;
  };
}

interface CursorRepository {
  url?: string;
  repository?: string;
  name?: string;
  defaultBranch?: string;
}

interface CursorListResponse<T> {
  items?: T[];
  agents?: T[];
  runs?: T[];
  repositories?: T[];
  nextCursor?: string;
  cursor?: string;
}

class CursorService {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null) {
    this.apiKey = apiKey;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Cursor API key not configured');
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cursor API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listAgents(limit = 100, cursor?: string): Promise<CursorListResponse<CursorAgent>> {
    let endpoint = `/agents?limit=${encodeURIComponent(String(limit))}`;
    if (cursor) {
      endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    }
    return this.request(endpoint);
  }

  async getAgent(agentId: string): Promise<CursorAgent> {
    return this.request(`/agents/${encodeURIComponent(agentId)}`);
  }

  async listRuns(agentId: string, limit = 20, cursor?: string): Promise<CursorListResponse<CursorRun>> {
    let endpoint = `/agents/${encodeURIComponent(agentId)}/runs?limit=${encodeURIComponent(String(limit))}`;
    if (cursor) {
      endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    }
    return this.request(endpoint);
  }

  async getRun(agentId: string, runId: string): Promise<CursorRun> {
    const response = await this.request<CursorRun | { run?: CursorRun }>(
      `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`
    );
    return this.unwrapRun(response) || { id: runId };
  }

  async getApiKeyInfo(): Promise<unknown> {
    return this.request('/me');
  }

  async listRepositories(): Promise<CursorListResponse<CursorRepository> | CursorRepository[]> {
    return this.request('/repositories');
  }

  normalizeAgent(agent: CursorAgent, run: CursorRun | null = null): AgentTask {
    const pushedBranch = run?.git?.branches?.find(entry => entry.branch);
    const pullRequest = run?.git?.branches?.find(entry => entry.prUrl);
    const repository = agent.repos?.[0]?.url || agent.source?.repository || null;

    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: run ? this.mapRunStatus(run.status) : this.mapAgentStatus(agent.status, !!agent.latestRunId),
      prompt: '',
      repository,
      branch: pushedBranch?.branch || agent.repos?.[0]?.startingRef || agent.target?.branchName || null,
      prUrl: pullRequest?.prUrl || agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt: run?.updatedAt || agent.updatedAt ? new Date(run?.updatedAt || agent.updatedAt || '') : null,
      summary: run?.result || agent.summary || null,
      rawId: agent.id,
      webUrl: agent.url || `https://cursor.com/agents/${agent.id}`,
    };
  }

  private mapRunStatus(status?: string): AgentTask['status'] {
    if (!status) return 'pending';

    const statusMap: Record<string, AgentTask['status']> = {
      CREATING: 'pending',
      RUNNING: 'running',
      FINISHED: 'completed',
      ERROR: 'failed',
      FAILED: 'failed',
      CANCELLED: 'stopped',
      EXPIRED: 'failed',
      STOPPED: 'stopped',
    };

    return statusMap[status.toUpperCase()] || 'pending';
  }

  private mapAgentStatus(status?: string, hasRun = false): AgentTask['status'] {
    if (!status) return hasRun ? 'completed' : 'pending';

    const statusMap: Record<string, AgentTask['status']> = {
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

    return statusMap[status.toUpperCase()] || (hasRun ? 'completed' : 'pending');
  }

  private extractListItems<T>(response: CursorListResponse<T> | T[] | null | undefined): T[] {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    return response.items || response.agents || response.runs || response.repositories || [];
  }

  private unwrapRun(response: CursorRun | { run?: CursorRun } | null | undefined): CursorRun | null {
    if (!response) return null;
    if (Object.prototype.hasOwnProperty.call(response, 'run')) {
      return (response as { run?: CursorRun }).run || null;
    }
    return response as CursorRun;
  }

  private async getLatestRun(agent: CursorAgent): Promise<CursorRun | null> {
    if (!agent.id) return null;

    if (agent.latestRunId) {
      const run = await this.getRun(agent.id, agent.latestRunId).catch(() => null);
      if (run) return run;
    }

    const runsResponse = await this.listRuns(agent.id, 1).catch(() => null);
    const runs = this.extractListItems<CursorRun>(runsResponse);
    return this.unwrapRun(runs[0]);
  }

  async getAllAgents(): Promise<AgentTask[]> {
    const response = await this.listAgents(100);
    const agents = this.extractListItems<CursorAgent>(response);
    const settled = await Promise.allSettled(
      agents.map(async agent => this.normalizeAgent(agent, await this.getLatestRun(agent)))
    );
    return settled
      .filter((result): result is PromiseFulfilledResult<AgentTask> => result.status === 'fulfilled')
      .map(result => result.value);
  }

  async getAgentDetails(agentId: string): Promise<AgentDetails> {
    const agent = await this.getAgent(agentId);
    const runsResponse = await this.listRuns(agentId, 20).catch(() => ({ items: [] }));
    const runs = this.extractListItems<CursorRun>(runsResponse).map(run => this.unwrapRun(run)).filter(Boolean) as CursorRun[];
    const latestRunId = agent.latestRunId || runs[0]?.id || null;
    const latestRun = latestRunId
      ? await this.getRun(agentId, latestRunId).catch(() => runs.find(run => run.id === latestRunId) || runs[0] || null)
      : runs[0] || null;

    const normalized = this.normalizeAgent(agent, latestRun);

    const conversation: ConversationMessage[] = latestRun?.result ? [{
      id: latestRun.id,
      type: 'assistant_message',
      text: latestRun.result,
      isUser: false,
    }] : [];

    const activities: Activity[] = runs.map(run => ({
      id: run.id,
      type: 'cursor_run',
      title: `Run ${run.status || 'UNKNOWN'}`,
      description: run.result || null,
      timestamp: run.updatedAt || run.createdAt,
    }));

    return {
      ...normalized,
      activities,
      conversation,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getApiKeyInfo();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async getAllRepositories(): Promise<Repository[]> {
    const response = await this.listRepositories();
    const repos = this.extractListItems<CursorRepository>(response);

    return repos.map(repo => ({
      id: repo.url || repo.repository || '',
      name: repo.name || this.extractRepoName(repo.url || repo.repository || ''),
      url: repo.url || repo.repository,
      defaultBranch: repo.defaultBranch || 'main',
      displayName: this.extractRepoName(repo.url || repo.repository || ''),
    }));
  }

  private extractRepoName(url: string): string {
    if (!url) return 'Unknown';
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    return match ? match[1] : url;
  }

  async createAgent(options: {
    prompt: string;
    repository: string;
    ref?: string;
    autoCreatePr?: boolean;
    branchName?: string;
    model?: string;
  }): Promise<AgentTask> {
    const { prompt, repository, ref = 'main', autoCreatePr = true, branchName, model } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!repository) {
      throw new Error('Repository is required');
    }

    const body: Record<string, unknown> = {
      prompt: { text: prompt },
      repos: [{ url: repository, startingRef: branchName || ref }],
      autoCreatePR: autoCreatePr,
    };

    if (model) {
      body.model = { id: model };
    }

    const response = await this.request<CursorAgent | { agent?: CursorAgent; run?: CursorRun }>('/agents', 'POST', body);
    const createResponse = response as { agent?: CursorAgent; run?: CursorRun };
    const agent = Object.prototype.hasOwnProperty.call(response, 'agent')
      ? createResponse.agent || (response as CursorAgent)
      : (response as CursorAgent);
    const run = Object.prototype.hasOwnProperty.call(response, 'run') ? createResponse.run || null : null;
    return this.normalizeAgent(agent, run);
  }

  async sendFollowup(agentId: string, prompt: string): Promise<void> {
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    await this.request(`/agents/${encodeURIComponent(agentId)}/runs`, 'POST', {
      prompt: { text: prompt },
    });
  }
}

export const cursorService = new CursorService();
export default cursorService;
