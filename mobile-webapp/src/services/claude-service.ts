/**
 * Anthropic Claude Cloud API Service
 * Cloud-only version for web/mobile (no local CLI support)
 */

import type { AgentTask, AgentDetails, Message } from '../store/types';

const BASE_URL = '/api/claude';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

interface ClaudeResponse {
  id: string;
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface TrackedConversation {
  id: string;
  createdAt: string;
  updatedAt?: string;
  prompt: string;
  repository?: string | null;
  title?: string | null;
  messages: ClaudeMessage[];
  lastResponse?: ClaudeResponse | null;
  status?: AgentTask['status'];
  error?: string;
}

// Store for tracking cloud conversations
let trackedConversations: TrackedConversation[] = [];

class ClaudeService {
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
      throw new Error('Anthropic API key not configured');
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
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async createMessage(
    messages: ClaudeMessage[],
    options: {
      model?: string;
      max_tokens?: number;
      title?: string;
      repository?: string;
    } = {}
  ): Promise<ClaudeResponse> {
    const body = {
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.max_tokens || 4096,
      messages,
    };

    return this.request('/messages', 'POST', body);
  }

  trackConversation(conversationId: string, metadata: Partial<TrackedConversation>) {
    const existingIndex = trackedConversations.findIndex(c => c.id === conversationId);
    const conversationInfo: TrackedConversation = {
      id: conversationId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      title: metadata.title || null,
      messages: metadata.messages || [],
      lastResponse: metadata.lastResponse || null,
      status: metadata.status,
      ...metadata,
    };

    if (existingIndex >= 0) {
      trackedConversations[existingIndex] = { ...trackedConversations[existingIndex], ...conversationInfo };
    } else {
      trackedConversations.unshift(conversationInfo);
    }

    // Keep only last 100 conversations
    if (trackedConversations.length > 100) {
      trackedConversations = trackedConversations.slice(0, 100);
    }

    // Persist to localStorage
    this.saveTrackedConversations();
  }

  setTrackedConversations(conversations: TrackedConversation[]) {
    trackedConversations = conversations || [];
  }

  getTrackedConversations(): TrackedConversation[] {
    return trackedConversations;
  }

  loadTrackedConversations() {
    try {
      const stored = localStorage.getItem('claude_tracked_conversations');
      if (stored) {
        trackedConversations = JSON.parse(stored);
      }
    } catch (err) {
      // Ignore error
    }
  }

  saveTrackedConversations() {
    try {
      localStorage.setItem('claude_tracked_conversations', JSON.stringify(trackedConversations));
    } catch (err) {
      // Ignore error
    }
  }

  normalizeConversation(conversation: TrackedConversation): AgentTask {
    return {
      id: `claude-cloud-${conversation.id}`,
      provider: 'claude-cloud',
      name: conversation.title || this.extractConversationName(conversation),
      status: this.mapStatus(conversation),
      prompt: conversation.prompt || '',
      repository: conversation.repository || null,
      branch: null,
      prUrl: null,
      createdAt: conversation.createdAt ? new Date(conversation.createdAt) : null,
      updatedAt: conversation.updatedAt ? new Date(conversation.updatedAt) : null,
      summary: this.extractSummary(conversation),
      rawId: conversation.id,
      webUrl: null,
    };
  }

  private extractConversationName(conversation: TrackedConversation): string {
    if (conversation.title) return conversation.title;
    if (conversation.prompt) {
      return conversation.prompt.substring(0, 50) + (conversation.prompt.length > 50 ? '...' : '');
    }
    return `Claude Conversation ${conversation.id.substring(0, 8)}`;
  }

  private extractSummary(conversation: TrackedConversation): string | null {
    const content = conversation.lastResponse?.content;
    if (content && content.length > 0) {
      const text = content.find(c => c.type === 'text')?.text;
      if (text) {
        return text.substring(0, 200) + (text.length > 200 ? '...' : '');
      }
    }
    return null;
  }

  private mapStatus(conversation: TrackedConversation): AgentTask['status'] {
    if (conversation.status) return conversation.status;
    if (conversation.lastResponse) return 'completed';
    return 'pending';
  }

  async getAllAgents(): Promise<AgentTask[]> {
    this.loadTrackedConversations();
    return trackedConversations.map(conv => this.normalizeConversation(conv));
  }

  async getAgentDetails(conversationId: string): Promise<AgentDetails> {
    this.loadTrackedConversations();
    const conversation = trackedConversations.find(c => c.id === conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages: Message[] = (conversation.messages || []).map((msg, idx) => ({
      id: `msg-${idx}`,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || '',
      timestamp: null,
    }));

    // Add assistant response if exists
    if (conversation.lastResponse) {
      const responseText = conversation.lastResponse.content.find(c => c.type === 'text')?.text || '';
      messages.push({
        id: `response-${conversation.lastResponse.id}`,
        role: 'assistant',
        content: responseText,
        timestamp: null,
      });
    }

    return {
      ...this.normalizeConversation(conversation),
      messages,
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Make a minimal request to verify the API key
      await this.createMessage([{ role: 'user', content: 'Hi' }], { max_tokens: 10 });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  async createTask(options: {
    prompt: string;
    repository?: string;
    title?: string;
  }): Promise<AgentTask> {
    const { prompt, repository, title } = options;

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const messages: ClaudeMessage[] = [{ role: 'user', content: prompt }];

    try {
      const response = await this.createMessage(messages, {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
      });

      this.trackConversation(conversationId, {
        prompt,
        repository,
        title: title || prompt.substring(0, 50),
        messages,
        lastResponse: response,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });

      return this.normalizeConversation({
        id: conversationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prompt,
        repository,
        title: title || prompt.substring(0, 50),
        messages,
        lastResponse: response,
        status: 'completed',
      });
    } catch (err) {
      this.trackConversation(conversationId, {
        prompt,
        repository,
        title,
        messages,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }
}

export const claudeService = new ClaudeService();
export default claudeService;
