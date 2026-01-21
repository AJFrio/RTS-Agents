/**
 * Jules API Service
 * Port of the Electron app's Jules service for web/mobile
 */

import type { AgentTask, AgentDetails, Repository, Activity } from '../store/types';

const BASE_URL = '/api/jules';

interface JulesSession {
  id: string;
  title?: string;
  prompt?: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext?: {
    source?: string;
    githubRepoContext?: {
      startingBranch?: string;
    };
  };
  outputs?: Array<{
    pullRequest?: {
      url?: string;
      description?: string;
    };
  }>;
}

interface JulesSource {
  name: string;
  id: string;
  githubRepo?: {
    owner: string;
    repo: string;
  };
}

interface JulesActivity {
  id: string;
  createTime?: string;
  originator?: string;
  progressUpdated?: {
    title?: string;
    description?: string;
  };
  planGenerated?: {
    plan?: {
      steps?: Array<{ title?: string }>;
    };
  };
  planApproved?: unknown;
  sessionCompleted?: unknown;
  artifacts?: unknown[];
}

class JulesService {
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
      throw new Error('Jules API key not configured');
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
      throw new Error(`Jules API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async listSessions(pageSize = 20, pageToken?: string): Promise<{ sessions?: JulesSession[]; nextPageToken?: string }> {
    let endpoint = `/sessions?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    return this.request(`/sessions/${sessionId}`);
  }

  async listActivities(sessionId: string, pageSize = 30, pageToken?: string): Promise<{ activities?: JulesActivity[]; nextPageToken?: string }> {
    let endpoint = `/sessions/${sessionId}/activities?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  async listSources(pageSize = 20, pageToken?: string): Promise<{ sources?: JulesSource[]; nextPageToken?: string }> {
    let endpoint = `/sources?pageSize=${pageSize}`;
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`;
    }
    return this.request(endpoint);
  }

  normalizeSession(session: JulesSession): AgentTask {
    return {
      id: `jules-${session.id}`,
      provider: 'jules',
      name: session.title || 'Jules Session',
      status: this.mapStatus(session),
      prompt: session.prompt || '',
      repository: this.extractRepository(session),
      branch: session.sourceContext?.githubRepoContext?.startingBranch || null,
      prUrl: this.extractPrUrl(session),
      createdAt: session.createTime ? new Date(session.createTime) : null,
      updatedAt: session.updateTime ? new Date(session.updateTime) : null,
      summary: this.extractSummary(session),
      rawId: session.id,
      webUrl: `https://jules.google.com/session/${session.id}`,
      source: session.sourceContext?.source || null,
    };
  }

  private mapStatus(session: JulesSession): AgentTask['status'] {
    if (session.outputs && session.outputs.length > 0) {
      return 'completed';
    }

    if (!session.state) {
      return 'pending';
    }

    const stateMap: Record<string, AgentTask['status']> = {
      'QUEUED': 'pending',
      'PLANNING': 'running',
      'AWAITING_PLAN_APPROVAL': 'pending',
      'AWAITING_USER_FEEDBACK': 'pending',
      'IN_PROGRESS': 'running',
      'PAUSED': 'stopped',
      'FAILED': 'failed',
      'COMPLETED': 'completed',
      'STATE_UNSPECIFIED': 'pending',
    };

    return stateMap[session.state] || 'pending';
  }

  private extractRepository(session: JulesSession): string | null {
    const source = session.sourceContext?.source;
    if (source && source.startsWith('sources/github/')) {
      const parts = source.replace('sources/github/', '').split('/');
      if (parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }
    }
    return null;
  }

  private extractPrUrl(session: JulesSession): string | null {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.url) {
          return output.pullRequest.url;
        }
      }
    }
    return null;
  }

  private extractSummary(session: JulesSession): string | null {
    if (session.outputs) {
      for (const output of session.outputs) {
        if (output.pullRequest?.description) {
          return output.pullRequest.description;
        }
      }
    }
    return null;
  }

  async getAllAgents(): Promise<AgentTask[]> {
    const response = await this.listSessions(100);
    const sessions = response.sessions || [];
    return sessions.map(session => this.normalizeSession(session));
  }

  async getAgentDetails(sessionId: string): Promise<AgentDetails> {
    const [session, activitiesResponse] = await Promise.all([
      this.getSession(sessionId),
      this.listActivities(sessionId, 100),
    ]);

    const activities: Activity[] = (activitiesResponse.activities || []).map(activity => ({
      id: activity.id,
      type: this.getActivityType(activity),
      originator: activity.originator,
      title: activity.progressUpdated?.title || activity.planGenerated?.plan?.steps?.[0]?.title || null,
      description: activity.progressUpdated?.description || null,
      timestamp: activity.createTime,
      artifacts: activity.artifacts || [],
    }));

    return {
      ...this.normalizeSession(session),
      activities,
    };
  }

  private getActivityType(activity: JulesActivity): string {
    if (activity.planGenerated) return 'plan_generated';
    if (activity.planApproved) return 'plan_approved';
    if (activity.progressUpdated) return 'progress';
    if (activity.sessionCompleted) return 'completed';
    return 'unknown';
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.listSources(1);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async getAllSources(): Promise<Repository[]> {
    const allSources: JulesSource[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listSources(50, pageToken);
      if (response.sources) {
        allSources.push(...response.sources);
      }
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allSources.map(source => ({
      id: source.name,
      name: source.id,
      owner: source.githubRepo?.owner || null,
      repo: source.githubRepo?.repo || null,
      displayName: source.githubRepo
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : source.id,
    }));
  }

  async createSession(options: {
    prompt: string;
    source: string;
    branch?: string;
    title?: string;
    autoCreatePr?: boolean;
    requirePlanApproval?: boolean;
  }): Promise<AgentTask> {
    const { prompt, source, branch = 'main', title, autoCreatePr = true, requirePlanApproval = false } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }
    if (!source) {
      throw new Error('Source is required');
    }

    const body: Record<string, unknown> = {
      prompt,
      sourceContext: {
        source,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
    };

    if (autoCreatePr) {
      body.automationMode = 'AUTO_CREATE_PR';
    }
    if (title) {
      body.title = title;
    }
    if (requirePlanApproval) {
      body.requirePlanApproval = true;
    }

    const response = await this.request<JulesSession>('/sessions', 'POST', body);
    return this.normalizeSession(response);
  }

  async sendFollowup(sessionId: string, prompt: string): Promise<void> {
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    await this.request(`/sessions/${sessionId}:sendMessage`, 'POST', {
      prompt,
    });
  }
}

export const julesService = new JulesService();
export default julesService;
