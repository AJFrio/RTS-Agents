/**
 * OpenAI Codex API Service
 * Port of the Electron app's Codex service for web/mobile
 */

import type { AgentTask, AgentDetails, Message } from '../store/types';

const BASE_URL = '/api/codex';

interface CodexThread {
  id: string;
  created_at?: number;
  metadata?: Record<string, unknown>;
}

interface CodexRun {
  id: string;
  status?: string;
  model?: string;
  created_at?: number;
  completed_at?: number;
  failed_at?: number;
}

interface CodexMessage {
  id: string;
  role: string;
  content: Array<{
    type: string;
    text?: {
      value: string;
    };
  }>;
  created_at?: number;
}

interface TrackedThread {
  id: string;
  createdAt?: string;
  prompt?: string;
  repository?: string | null;
  branch?: string | null;
  prUrl?: string | null;
  title?: string;
}

// Store for tracking created thread IDs
let trackedThreads: TrackedThread[] = [];

class CodexService {
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
      throw new Error('OpenAI API key not configured');
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
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async createThread(options: {
    messages?: Array<{ role: string; content: string }>;
    metadata?: Record<string, unknown>;
  } = {}): Promise<CodexThread> {
    const body: Record<string, unknown> = {};

    if (options.messages && options.messages.length > 0) {
      body.messages = options.messages;
    }
    if (options.metadata) {
      body.metadata = options.metadata;
    }

    const response = await this.request<CodexThread>('/threads', 'POST', body);
    return response;
  }

  async getThread(threadId: string): Promise<CodexThread> {
    return this.request(`/threads/${threadId}`);
  }

  async listMessages(threadId: string, limit = 100): Promise<{ data?: CodexMessage[] }> {
    return this.request(`/threads/${threadId}/messages?limit=${limit}`);
  }

  async createMessage(threadId: string, content: string, role = 'user'): Promise<CodexMessage> {
    return this.request(`/threads/${threadId}/messages`, 'POST', {
      role,
      content,
    });
  }

  async createRun(threadId: string, options: { assistant_id?: string } = {}): Promise<CodexRun> {
    const body = {
      assistant_id: options.assistant_id || 'asst_codex', // Default Codex assistant
      ...options,
    };

    return this.request(`/threads/${threadId}/runs`, 'POST', body);
  }

  async listRuns(threadId: string, limit = 20): Promise<{ data?: CodexRun[] }> {
    return this.request(`/threads/${threadId}/runs?limit=${limit}`);
  }

  async getRun(threadId: string, runId: string): Promise<CodexRun> {
    return this.request(`/threads/${threadId}/runs/${runId}`);
  }

  trackThread(threadId: string, metadata: Partial<TrackedThread> = {}) {
    const existingIndex = trackedThreads.findIndex(t => t.id === threadId);
    const threadInfo: TrackedThread = {
      id: threadId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      branch: metadata.branch || null,
      title: metadata.title,
      ...metadata,
    };

    if (existingIndex >= 0) {
      trackedThreads[existingIndex] = { ...trackedThreads[existingIndex], ...threadInfo };
    } else {
      trackedThreads.unshift(threadInfo);
    }

    // Keep only last 100 threads
    if (trackedThreads.length > 100) {
      trackedThreads = trackedThreads.slice(0, 100);
    }

    // Persist to localStorage
    this.saveTrackedThreads();
  }

  setTrackedThreads(threads: TrackedThread[]) {
    trackedThreads = threads || [];
  }

  getTrackedThreads(): TrackedThread[] {
    return trackedThreads;
  }

  loadTrackedThreads() {
    try {
      const stored = localStorage.getItem('codex_tracked_threads');
      if (stored) {
        trackedThreads = JSON.parse(stored);
      }
    } catch (err) {
      // Ignore error
    }
  }

  saveTrackedThreads() {
    try {
      localStorage.setItem('codex_tracked_threads', JSON.stringify(trackedThreads));
    } catch (err) {
      // Ignore error
    }
  }

  normalizeThread(thread: CodexThread, tracked: TrackedThread = { id: thread.id }, latestRun?: CodexRun | null): AgentTask {
    return {
      id: `codex-${thread.id}`,
      provider: 'codex',
      name: this.extractThreadName(tracked, thread),
      status: this.mapStatus(latestRun),
      prompt: tracked.prompt || '',
      repository: tracked.repository || null,
      branch: tracked.branch || null,
      prUrl: tracked.prUrl || null,
      createdAt: thread.created_at ? new Date(thread.created_at * 1000) : null,
      updatedAt: latestRun?.created_at ? new Date(latestRun.created_at * 1000) : null,
      summary: latestRun?.status || null,
      rawId: thread.id,
      webUrl: `https://platform.openai.com/playground/assistants?thread=${thread.id}`,
    };
  }

  private extractThreadName(tracked: TrackedThread, thread: CodexThread): string {
    if (tracked.title) return tracked.title;
    if (tracked.prompt) {
      return tracked.prompt.substring(0, 50) + (tracked.prompt.length > 50 ? '...' : '');
    }
    return `Codex Thread ${thread.id.substring(0, 8)}`;
  }

  private mapStatus(run?: CodexRun | null): AgentTask['status'] {
    if (!run) return 'pending';

    const status = run.status?.toLowerCase();

    switch (status) {
      case 'queued':
      case 'in_progress':
        return 'running';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'cancelled':
      case 'expired':
        return 'failed';
      case 'requires_action':
        return 'pending';
      default:
        return 'pending';
    }
  }

  async getAllAgents(): Promise<AgentTask[]> {
    this.loadTrackedThreads();

    const results = await Promise.allSettled(
      trackedThreads.map(async tracked => {
        const [thread, runsResponse] = await Promise.all([
          this.getThread(tracked.id),
          this.listRuns(tracked.id, 1),
        ]);
        const latestRun = runsResponse.data?.[0];
        return this.normalizeThread(thread, tracked, latestRun);
      })
    );

    return results
      .filter((result): result is PromiseFulfilledResult<AgentTask> => result.status === 'fulfilled')
      .map(result => result.value);
  }

  async getAgentDetails(threadId: string): Promise<AgentDetails> {
    const [thread, messagesResponse, runsResponse] = await Promise.all([
      this.getThread(threadId),
      this.listMessages(threadId, 100),
      this.listRuns(threadId, 10),
    ]);

    const tracked = trackedThreads.find(t => t.id === threadId) || { id: threadId };
    const latestRun = runsResponse.data?.[0];

    const messages: Message[] = (messagesResponse.data || [])
      .map(msg => ({
        id: msg.id,
        role: msg.role,
        content: this.extractMessageContent(msg),
        createdAt: msg.created_at ? new Date(msg.created_at * 1000) : null,
      }))
      .reverse();

    return {
      ...this.normalizeThread(thread, tracked, latestRun),
      messages,
    };
  }

  private extractMessageContent(message: CodexMessage): string {
    if (!message.content || message.content.length === 0) return '';

    return message.content
      .filter(c => c.type === 'text')
      .map(c => c.text?.value || '')
      .join('\n');
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Test by listing models
      await this.request('/models');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async createTask(options: {
    prompt: string;
    repository?: string;
    branch?: string;
    title?: string;
  }): Promise<AgentTask> {
    const { prompt, repository, branch, title } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const thread = await this.createThread({
      messages: [{ role: 'user', content: prompt }],
      metadata: {
        title: title || prompt.substring(0, 50),
        repository: repository || null,
        branch: branch || null,
      },
    });

    this.trackThread(thread.id, {
      prompt,
      repository,
      branch,
      title,
    });

    return this.normalizeThread(thread, {
      id: thread.id,
      prompt,
      repository,
      branch,
      title,
    });
  }

  async sendFollowup(threadId: string, prompt: string): Promise<void> {
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    await this.createMessage(threadId, prompt);
    await this.createRun(threadId);
  }
}

export const codexService = new CodexService();
export default codexService;
