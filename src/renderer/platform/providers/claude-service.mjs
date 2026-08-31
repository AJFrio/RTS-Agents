/**
 * Anthropic Claude Cloud API service (web runtime).
 *
 * Port of mobile-webapp/src/services/claude-service.ts to plain ESM JS
 * (cloud-only — no local CLI support on web). Talks to the same-origin worker
 * proxy at /api/claude. Conversations are tracked in browser storage under
 * 'claude_tracked_conversations'; the raw key-value store is injectable for
 * tests.
 */

import { createRequester } from './provider-http.mjs';
import { normalizeConversation } from './claude-mappers.mjs';

const BASE_URL = '/api/claude';
const TRACKED_CONVERSATIONS_KEY = 'claude_tracked_conversations';
const MAX_TRACKED = 100;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export function createClaudeService({ storage, fetchImpl, kv = null } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'Anthropic',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('claude');
      if (!apiKey) throw new Error('Anthropic API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  let trackedConversations = [];

  function loadTrackedConversations() {
    if (!kv) return;
    try {
      const stored = kv.getItem(TRACKED_CONVERSATIONS_KEY);
      if (stored) trackedConversations = JSON.parse(stored);
    } catch {
      // Corrupt or unavailable storage — fall back to the in-memory list.
    }
  }

  function saveTrackedConversations() {
    if (!kv) return;
    try {
      kv.setItem(TRACKED_CONVERSATIONS_KEY, JSON.stringify(trackedConversations));
    } catch {
      // Storage unavailable (quota/private mode) — tracking stays in memory.
    }
  }

  function getTrackedConversations() {
    return trackedConversations;
  }

  function trackConversation(conversationId, metadata) {
    const existingIndex = trackedConversations.findIndex((c) => c.id === conversationId);
    const conversationInfo = {
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
      trackedConversations[existingIndex] = {
        ...trackedConversations[existingIndex],
        ...conversationInfo,
      };
    } else {
      trackedConversations.unshift(conversationInfo);
    }

    if (trackedConversations.length > MAX_TRACKED) {
      trackedConversations = trackedConversations.slice(0, MAX_TRACKED);
    }

    saveTrackedConversations();
  }

  async function createMessage(messages, options = {}) {
    const body = {
      model: options.model || DEFAULT_MODEL,
      max_tokens: options.max_tokens || 4096,
      messages,
    };

    return request('/messages', 'POST', body);
  }

  async function getAllAgents() {
    loadTrackedConversations();
    return trackedConversations.map((conv) => normalizeConversation(conv));
  }

  async function getAgentDetails(conversationId) {
    loadTrackedConversations();
    const conversation = trackedConversations.find((c) => c.id === conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = (conversation.messages || []).map((msg, idx) => ({
      id: `msg-${idx}`,
      role: msg.role,
      content:
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.find((c) => c.type === 'text')?.text || '',
      timestamp: null,
    }));

    // Add assistant response if exists
    if (conversation.lastResponse) {
      const responseText =
        conversation.lastResponse.content.find((c) => c.type === 'text')?.text || '';
      messages.push({
        id: `response-${conversation.lastResponse.id}`,
        role: 'assistant',
        content: responseText,
        timestamp: null,
      });
    }

    return { ...normalizeConversation(conversation), messages };
  }

  async function testConnection() {
    try {
      // Make a minimal request to verify the API key
      await createMessage([{ role: 'user', content: 'Hi' }], { max_tokens: 10 });
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function listModels() {
    return request('/models');
  }

  async function createTask(options) {
    const { prompt, repository, title, model } = options;

    if (!prompt) throw new Error('Prompt is required');

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const messages = [{ role: 'user', content: prompt }];

    try {
      const response = await createMessage(messages, {
        model: model || DEFAULT_MODEL,
        max_tokens: 4096,
      });

      trackConversation(conversationId, {
        prompt,
        repository,
        title: title || prompt.substring(0, 50),
        messages,
        lastResponse: response,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });

      return normalizeConversation({
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
      trackConversation(conversationId, {
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

  async function sendFollowup(conversationId, prompt) {
    if (!prompt) throw new Error('Prompt is required');

    loadTrackedConversations();
    const conversation = trackedConversations.find((c) => c.id === conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = [...(conversation.messages || [])];

    // If there was a previous response, add it as an assistant message
    if (conversation.lastResponse) {
      const responseText =
        conversation.lastResponse.content.find((c) => c.type === 'text')?.text || '';
      messages.push({
        role: 'assistant',
        content: responseText,
      });
    }

    // Add new user message
    messages.push({
      role: 'user',
      content: prompt,
    });

    try {
      const response = await createMessage(messages, {
        model: DEFAULT_MODEL,
        max_tokens: 4096,
      });

      trackConversation(conversationId, {
        messages,
        lastResponse: response,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Still track the user message even if the API failed, but mark as failed
      trackConversation(conversationId, {
        messages,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
        updatedAt: new Date().toISOString(),
      });
      throw err;
    }
  }

  return {
    createMessage,
    listModels,
    trackConversation,
    getTrackedConversations,
    loadTrackedConversations,
    normalizeConversation,
    getAllAgents,
    getAgentDetails,
    testConnection,
    createTask,
    sendFollowup,
  };
}

export default createClaudeService;
