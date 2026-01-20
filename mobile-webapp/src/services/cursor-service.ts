/**
 * Cursor Cloud API Service
 * Port of the Electron app's Cursor service for web/mobile
 */

import type { AgentTask, AgentDetails, Repository, ConversationMessage } from '../store/types';

const BASE_URL = '/api/cursor';

interface CursorAgent {
  id: string;
  name?: string;
  status?: string;
  summary?: string;
  createdAt?: string;
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

interface CursorMessage {
  id: string;
  type: string;
  text: string;
}

interface CursorRepository {
  url?: string;
  repository?: string;
  name?: string;
  defaultBranch?: string;
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

  async listAgents(limit = 100, cursor?: string): Promise<{ agents?: CursorAgent[]; cursor?: string }> {
    let endpoint = `/agents?limit=${limit}`;
    if (cursor) {
      endpoint += `&cursor=${cursor}`;
    }
    return this.request(endpoint);
  }

  async getAgent(agentId: string): Promise<CursorAgent> {
    return this.request(`/agents/${agentId}`);
  }

  async getConversation(agentId: string): Promise<{ messages?: CursorMessage[] }> {
    return this.request(`/agents/${agentId}/conversation`);
  }

  async getApiKeyInfo(): Promise<unknown> {
    return this.request('/me');
  }

  async listRepositories(): Promise<{ repositories?: CursorRepository[] } | CursorRepository[]> {
    return this.request('/repositories');
  }

  normalizeAgent(agent: CursorAgent): AgentTask {
    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: this.mapStatus(agent.status),
      prompt: '',
      repository: agent.source?.repository || null,
      branch: agent.target?.branchName || null,
      prUrl: agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt: null,
      summary: agent.summary || null,
      rawId: agent.id,
      webUrl: `https://cursor.com/agents/${agent.id}`,
    };
  }

  private mapStatus(status?: string): AgentTask['status'] {
    if (!status) return 'pending';

    const statusMap: Record<string, AgentTask['status']> = {
      'CREATING': 'pending',
      'RUNNING': 'running',
      'FINISHED': 'completed',
      'STOPPED': 'stopped',
    };

    return statusMap[status.toUpperCase()] || 'pending';
  }

  async getAllAgents(): Promise<AgentTask[]> {
    const response = await this.listAgents(100);
    const agents = response.agents || [];
    return agents.map(agent => this.normalizeAgent(agent));
  }

  async getAgentDetails(agentId: string): Promise<AgentDetails> {
    const [agent, conversationResponse] = await Promise.all([
      this.getAgent(agentId),
      this.getConversation(agentId).catch(() => ({ messages: [] })),
    ]);

    const normalized = this.normalizeAgent(agent);
    const messages = conversationResponse.messages || [];

    // Extract prompt from first user message
    const firstUserMessage = messages.find(m => m.type === 'user_message');
    if (firstUserMessage) {
      normalized.prompt = firstUserMessage.text;
    }

    const conversation: ConversationMessage[] = messages.map(msg => ({
      id: msg.id,
      type: msg.type,
      text: msg.text,
      isUser: msg.type === 'user_message',
    }));

    return {
      ...normalized,
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
    try {
      const response = await this.listRepositories();
      const repos = Array.isArray(response) ? response : (response.repositories || []);

      return repos.map(repo => ({
        id: repo.url || repo.repository || '',
        name: repo.name || this.extractRepoName(repo.url || repo.repository || ''),
        url: repo.url || repo.repository,
        defaultBranch: repo.defaultBranch || 'main',
        displayName: this.extractRepoName(repo.url || repo.repository || ''),
      }));
    } catch (err) {
      throw err;
    }
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
      source: {
        repository,
        ref,
      },
      target: {
        autoCreatePr,
      },
    };

    if (branchName) {
      (body.target as Record<string, unknown>).branchName = branchName;
    }
    if (model) {
      body.model = model;
    }

    const response = await this.request<CursorAgent>('/agents', 'POST', body);
    return this.normalizeAgent(response);
  }
}

export const cursorService = new CursorService();
export default cursorService;
