/**
 * OpenAI Codex API service (web runtime).
 *
 * Port of mobile-webapp/src/services/codex-service.ts to plain ESM JS.
 * Talks to the same-origin worker proxy at /api/codex. Created threads are
 * tracked in browser storage under 'codex_tracked_threads' (array of
 * {id, createdAt, prompt, repository, branch, title, prUrl}) so the agent
 * list survives reloads; the raw key-value store is injectable for tests.
 */

import { createRequester } from './provider-http.mjs';

const BASE_URL = '/api/codex';
const TRACKED_THREADS_KEY = 'codex_tracked_threads';
const MAX_TRACKED = 100;

export function createCodexService({ storage, fetchImpl, kv = null } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'OpenAI',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('codex');
      if (!apiKey) throw new Error('OpenAI API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  let trackedThreads = [];

  function loadTrackedThreads() {
    if (!kv) return;
    try {
      const stored = kv.getItem(TRACKED_THREADS_KEY);
      if (stored) trackedThreads = JSON.parse(stored);
    } catch {
      // Corrupt or unavailable storage — fall back to the in-memory list.
    }
  }

  function saveTrackedThreads() {
    if (!kv) return;
    try {
      kv.setItem(TRACKED_THREADS_KEY, JSON.stringify(trackedThreads));
    } catch {
      // Storage unavailable (quota/private mode) — tracking stays in memory.
    }
  }

  function getTrackedThreads() {
    return trackedThreads;
  }

  function trackThread(threadId, metadata = {}) {
    const existingIndex = trackedThreads.findIndex((t) => t.id === threadId);
    const threadInfo = {
      id: threadId,
      createdAt: new Date().toISOString(),
      prompt: metadata.prompt || '',
      repository: metadata.repository || null,
      branch: metadata.branch || null,
      prUrl: metadata.prUrl || null,
      title: metadata.title,
      ...metadata,
    };

    if (existingIndex >= 0) {
      trackedThreads[existingIndex] = { ...trackedThreads[existingIndex], ...threadInfo };
    } else {
      trackedThreads.unshift(threadInfo);
    }

    if (trackedThreads.length > MAX_TRACKED) {
      trackedThreads = trackedThreads.slice(0, MAX_TRACKED);
    }

    saveTrackedThreads();
  }

  async function createThread(options = {}) {
    const body = {};

    if (options.messages && options.messages.length > 0) {
      body.messages = options.messages;
    }
    if (options.metadata) {
      body.metadata = options.metadata;
    }

    return request('/threads', 'POST', body);
  }

  async function getThread(threadId) {
    return request(`/threads/${threadId}`);
  }

  async function listMessages(threadId, limit = 100) {
    return request(`/threads/${threadId}/messages?limit=${limit}`);
  }

  async function createMessage(threadId, content, role = 'user') {
    return request(`/threads/${threadId}/messages`, 'POST', {
      role,
      content,
    });
  }

  async function createRun(threadId, options = {}) {
    const body = {
      assistant_id: options.assistant_id || 'asst_codex', // Default Codex assistant
      ...options,
    };

    return request(`/threads/${threadId}/runs`, 'POST', body);
  }

  async function listRuns(threadId, limit = 20) {
    return request(`/threads/${threadId}/runs?limit=${limit}`);
  }

  function extractThreadName(tracked, thread) {
    if (tracked.title) return tracked.title;
    if (tracked.prompt) {
      return tracked.prompt.substring(0, 50) + (tracked.prompt.length > 50 ? '...' : '');
    }
    return `Codex Thread ${thread.id.substring(0, 8)}`;
  }

  function mapStatus(run) {
    if (!run) return 'pending';

    switch (run.status?.toLowerCase()) {
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

  function normalizeThread(thread, tracked = { id: thread.id }, latestRun = null) {
    return {
      id: `codex-${thread.id}`,
      provider: 'codex',
      name: extractThreadName(tracked, thread),
      status: mapStatus(latestRun),
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

  async function getAllAgents() {
    loadTrackedThreads();

    const results = await Promise.allSettled(
      trackedThreads.map(async (tracked) => {
        const [thread, runsResponse] = await Promise.all([
          getThread(tracked.id),
          listRuns(tracked.id, 1),
        ]);
        const latestRun = runsResponse.data?.[0];
        return normalizeThread(thread, tracked, latestRun);
      })
    );

    return results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  function extractMessageContent(message) {
    if (!message.content || message.content.length === 0) return '';

    return message.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text?.value || '')
      .join('\n');
  }

  async function getAgentDetails(threadId) {
    const [thread, messagesResponse, runsResponse] = await Promise.all([
      getThread(threadId),
      listMessages(threadId, 100),
      listRuns(threadId, 10),
    ]);

    const tracked = trackedThreads.find((t) => t.id === threadId) || { id: threadId };
    const latestRun = runsResponse.data?.[0];

    const messages = (messagesResponse.data || [])
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: extractMessageContent(msg),
        createdAt: msg.created_at ? new Date(msg.created_at * 1000) : null,
      }))
      .reverse();

    return { ...normalizeThread(thread, tracked, latestRun), messages };
  }

  async function testConnection() {
    try {
      // Test by listing models
      await request('/models');
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function createTask(options) {
    const { prompt, repository, branch, title } = options;

    if (!prompt) throw new Error('Prompt is required');

    const thread = await createThread({
      messages: [{ role: 'user', content: prompt }],
      metadata: {
        title: title || prompt.substring(0, 50),
        repository: repository || null,
        branch: branch || null,
      },
    });

    trackThread(thread.id, {
      prompt,
      repository,
      branch,
      title,
    });

    return normalizeThread(thread, {
      id: thread.id,
      prompt,
      repository,
      branch,
      title,
    });
  }

  async function sendFollowup(threadId, prompt) {
    if (!prompt) throw new Error('Prompt is required');

    await createMessage(threadId, prompt);
    await createRun(threadId);
  }

  return {
    createThread,
    getThread,
    listMessages,
    createMessage,
    createRun,
    listRuns,
    trackThread,
    getTrackedThreads,
    loadTrackedThreads,
    normalizeThread,
    getAllAgents,
    getAgentDetails,
    testConnection,
    createTask,
    sendFollowup,
  };
}

export default createCodexService;
