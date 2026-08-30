/**
 * Jules API service (web runtime).
 *
 * Port of mobile-webapp/src/services/jules-service.ts to plain ESM JS.
 * Talks to the same-origin worker proxy at /api/jules; the stored API key is
 * sent via the X-API-Key header. Normalizes sessions into the desktop Agent
 * shape (id, provider, name, status, prompt, repository, branch, prUrl,
 * createdAt, updatedAt, summary, rawId, webUrl, source).
 */

import { createRequester } from './provider-http.mjs';
import { mapActivity, extractMediaFromArtifacts } from './jules-activities.mjs';

const BASE_URL = '/api/jules';

const STATUS_MAP = {
  QUEUED: 'pending',
  PLANNING: 'running',
  AWAITING_PLAN_APPROVAL: 'pending',
  AWAITING_USER_FEEDBACK: 'pending',
  IN_PROGRESS: 'running',
  PAUSED: 'stopped',
  FAILED: 'failed',
  COMPLETED: 'completed',
  STATE_UNSPECIFIED: 'pending',
};

export function createJulesService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'Jules',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('jules');
      if (!apiKey) throw new Error('Jules API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  async function listSessions(pageSize = 20, pageToken) {
    let endpoint = `/sessions?pageSize=${pageSize}`;
    if (pageToken) endpoint += `&pageToken=${pageToken}`;
    return request(endpoint);
  }

  async function getSession(sessionId) {
    return request(`/sessions/${sessionId}`);
  }

  async function listActivities(sessionId, pageSize = 30, pageToken) {
    let endpoint = `/sessions/${sessionId}/activities?pageSize=${pageSize}`;
    if (pageToken) endpoint += `&pageToken=${pageToken}`;
    return request(endpoint);
  }

  async function getActivity(sessionId, activityId) {
    return request(`/sessions/${sessionId}/activities/${activityId}`);
  }

  async function listSources(pageSize = 20, pageToken) {
    let endpoint = `/sources?pageSize=${pageSize}`;
    if (pageToken) endpoint += `&pageToken=${pageToken}`;
    return request(endpoint);
  }

  function mapStatus(session) {
    if (session.outputs && session.outputs.length > 0) return 'completed';
    if (!session.state) return 'pending';
    return STATUS_MAP[session.state] || 'pending';
  }

  function extractRepository(session) {
    const source = session.sourceContext?.source;
    if (source && source.startsWith('sources/github/')) {
      const parts = source.replace('sources/github/', '').split('/');
      if (parts.length >= 2) {
        return `https://github.com/${parts[0]}/${parts[1]}`;
      }
    }
    return null;
  }

  function extractPrUrl(session) {
    for (const output of session.outputs || []) {
      if (output.pullRequest?.url) return output.pullRequest.url;
    }
    return null;
  }

  function extractSummary(session) {
    for (const output of session.outputs || []) {
      if (output.pullRequest?.description) return output.pullRequest.description;
    }
    return null;
  }

  function normalizeSession(session) {
    return {
      id: `jules-${session.id}`,
      provider: 'jules',
      name: session.title || 'Jules Session',
      status: mapStatus(session),
      prompt: session.prompt || '',
      repository: extractRepository(session),
      branch: session.sourceContext?.githubRepoContext?.startingBranch || null,
      prUrl: extractPrUrl(session),
      createdAt: session.createTime ? new Date(session.createTime) : null,
      updatedAt: session.updateTime ? new Date(session.updateTime) : null,
      summary: extractSummary(session),
      rawId: session.id,
      webUrl: `https://jules.google.com/session/${session.id}`,
      source: session.sourceContext?.source || null,
    };
  }

  async function getAllAgents() {
    const response = await listSessions(100);
    const sessions = response.sessions || [];
    return sessions.map((session) => normalizeSession(session));
  }

  async function getAgentDetailsText(sessionId) {
    assertResourceId(sessionId, 'session ID');

    const [session, activitiesResponse] = await Promise.all([
      getSession(sessionId),
      listActivities(sessionId, 100),
    ]);

    const activities = (activitiesResponse.activities || []).map((activity) =>
      mapActivity(activity, true)
    );

    return { ...normalizeSession(session), activities };
  }

  async function getActivityMedia(sessionId, activityId) {
    assertResourceId(sessionId, 'session ID');
    assertResourceId(activityId, 'activity ID');

    const activity = await getActivity(sessionId, activityId);
    return { mediaItems: extractMediaFromArtifacts(activity.artifacts) };
  }

  async function getAgentDetails(sessionId) {
    return getAgentDetailsText(sessionId);
  }

  async function testConnection() {
    try {
      await listSources(1);
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function getAllSources() {
    const allSources = [];
    let pageToken;

    do {
      const response = await listSources(50, pageToken);
      if (response.sources) allSources.push(...response.sources);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allSources.map((source) => ({
      id: source.name,
      name: source.id,
      owner: source.githubRepo?.owner || null,
      repo: source.githubRepo?.repo || null,
      displayName: source.githubRepo
        ? `${source.githubRepo.owner}/${source.githubRepo.repo}`
        : source.id,
    }));
  }

  async function createSession(options) {
    const {
      prompt,
      source,
      branch = 'main',
      title,
      autoCreatePr = true,
      requirePlanApproval = false,
    } = options;

    if (!prompt) throw new Error('Prompt is required');
    if (!source) throw new Error('Source is required');

    const body = {
      prompt,
      sourceContext: {
        source,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
    };

    if (autoCreatePr) body.automationMode = 'AUTO_CREATE_PR';
    if (title) body.title = title;
    if (requirePlanApproval) body.requirePlanApproval = true;

    const response = await request('/sessions', 'POST', body);
    return normalizeSession(response);
  }

  async function sendFollowup(sessionId, prompt) {
    if (!prompt) throw new Error('Prompt is required');
    await request(`/sessions/${sessionId}:sendMessage`, 'POST', { prompt });
  }

  return {
    listSessions,
    getSession,
    listActivities,
    getActivity,
    listSources,
    normalizeSession,
    getAllAgents,
    getAgentDetails,
    getAgentDetailsText,
    getActivityMedia,
    getAllSources,
    createSession,
    sendFollowup,
    testConnection,
  };
}

function assertResourceId(id, label) {
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid Jules ${label}`);
  }
}

export default createJulesService;
