/**
 * Cursor Cloud API service (web runtime).
 *
 * Port of mobile-webapp/src/services/cursor-service.ts to plain ESM JS.
 * Talks to the same-origin worker proxy at /api/cursor; the stored API key is
 * sent via the X-API-Key header (the worker upgrades it to Basic auth).
 */

import { createRequester } from './provider-http.mjs';
import {
  mapRunStatus,
  mapAgentStatus,
  extractListItems,
  unwrapEnvelope,
  buildRunActivity,
  buildConversationFromRuns,
  extractRepoName,
} from './cursor-runs.mjs';

const BASE_URL = '/api/cursor';

export function createCursorService({ storage, fetchImpl } = {}) {
  const request = createRequester({
    baseUrl: BASE_URL,
    label: 'Cursor',
    fetchImpl,
    getHeaders() {
      const apiKey = storage.getApiKey('cursor');
      if (!apiKey) throw new Error('Cursor API key not configured');
      return { 'X-API-Key': apiKey };
    },
  });

  async function listAgents(limit = 100, cursor) {
    let endpoint = `/agents?limit=${encodeURIComponent(String(limit))}`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    return request(endpoint);
  }

  function resolveAgentId(agentId) {
    if (!agentId) throw new Error('Cursor agent ID is required');
    return String(agentId).replace(/^cursor-/, '');
  }

  async function getAgent(agentId) {
    const id = resolveAgentId(agentId);
    const response = await request(`/agents/${encodeURIComponent(id)}`);
    const agent = unwrapEnvelope(response, 'agent');
    if (!agent) throw new Error('Cursor agent not found');
    return agent;
  }

  async function listRuns(agentId, limit = 20, cursor) {
    const id = resolveAgentId(agentId);
    let endpoint = `/agents/${encodeURIComponent(id)}/runs?limit=${encodeURIComponent(String(limit))}`;
    if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
    return request(endpoint);
  }

  async function getRun(agentId, runId) {
    const id = resolveAgentId(agentId);
    const response = await request(
      `/agents/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`
    );
    return unwrapEnvelope(response, 'run') || { id: runId };
  }

  async function getApiKeyInfo() {
    return request('/me');
  }

  async function listRepositories() {
    return request('/repositories');
  }

  function normalizeAgent(agent, run = null) {
    const pushedBranch = run?.git?.branches?.find((entry) => entry.branch);
    const pullRequest = run?.git?.branches?.find((entry) => entry.prUrl);
    const repository = agent.repos?.[0]?.url || agent.source?.repository || null;

    return {
      id: `cursor-${agent.id}`,
      provider: 'cursor',
      name: agent.name || 'Cursor Cloud Agent',
      status: run ? mapRunStatus(run.status) : mapAgentStatus(agent.status, !!agent.latestRunId),
      prompt: '',
      repository,
      branch: pushedBranch?.branch || agent.repos?.[0]?.startingRef || agent.target?.branchName || null,
      prUrl: pullRequest?.prUrl || agent.target?.prUrl || null,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : null,
      updatedAt:
        run?.updatedAt || agent.updatedAt ? new Date(run?.updatedAt || agent.updatedAt || '') : null,
      summary: run?.result || agent.summary || null,
      rawId: agent.id,
      webUrl: agent.url || `https://cursor.com/agents/${agent.id}`,
    };
  }

  async function getLatestRun(agent) {
    const agentRecord = unwrapEnvelope(agent, 'agent');
    if (!agentRecord?.id) return null;

    if (agentRecord.latestRunId) {
      const run = await getRun(agentRecord.id, agentRecord.latestRunId).catch(() => null);
      if (run) return run;
    }

    const runsResponse = await listRuns(agentRecord.id, 1).catch(() => null);
    const runs = extractListItems(runsResponse);
    return unwrapEnvelope(runs[0], 'run');
  }

  function mergeRunSummary(listRun, detailRun) {
    if (!detailRun) return listRun;
    return {
      ...listRun,
      ...detailRun,
      git: detailRun.git || listRun.git,
    };
  }

  async function hydrateRuns(agentId, runs) {
    const settled = await Promise.allSettled(
      runs.map((run) => (run.id ? getRun(agentId, run.id) : Promise.resolve(null)))
    );

    return runs.map((run, index) => {
      const entry = settled[index];
      const detail = entry.status === 'fulfilled' ? entry.value : null;
      return mergeRunSummary(run, detail);
    });
  }

  async function getAllAgents() {
    const response = await listAgents(100);
    const agents = extractListItems(response)
      .map((item) => unwrapEnvelope(item, 'agent'))
      .filter((item) => !!item);
    const settled = await Promise.allSettled(
      agents.map(async (agent) => normalizeAgent(agent, await getLatestRun(agent)))
    );
    return settled
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
  }

  async function getAgentDetails(agentId) {
    const id = resolveAgentId(agentId);
    const agent = await getAgent(id);

    let runsResponse;
    try {
      runsResponse = await listRuns(id, 20);
    } catch (err) {
      console.warn(`Cursor listRuns failed for ${id}:`, err instanceof Error ? err.message : err);
      runsResponse = { items: [] };
    }

    const listRunsItems = extractListItems(runsResponse)
      .map((run) => unwrapEnvelope(run, 'run'))
      .filter((run) => !!run);
    const runs = await hydrateRuns(id, listRunsItems);

    const latestRunId = agent.latestRunId || runs[0]?.id || null;
    const latestRun = runs.find((run) => run.id === latestRunId) || runs[0] || null;

    const terminalRunsWithResult = runs.filter((run) => run.result?.trim());
    const summary = latestRun?.result || terminalRunsWithResult[0]?.result || agent.name || null;

    const normalized = normalizeAgent(agent, latestRun);

    return {
      ...normalized,
      summary,
      activities: runs.map((run) => buildRunActivity(run)),
      conversation: buildConversationFromRuns(runs),
      latestRunId,
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

  async function testConnection() {
    try {
      await getApiKeyInfo();
      return { success: true };
    } catch (err) {
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function getAllRepositories() {
    const response = await listRepositories();
    const repos = extractListItems(response);

    return repos.map((repo) => ({
      id: repo.url || repo.repository || '',
      name: repo.name || extractRepoName(repo.url || repo.repository || ''),
      url: repo.url || repo.repository,
      defaultBranch: repo.defaultBranch || 'main',
      displayName: extractRepoName(repo.url || repo.repository || ''),
    }));
  }

  async function createAgent(options) {
    const { prompt, repository, ref = 'main', autoCreatePr = true, branchName, model } = options;

    if (!prompt) throw new Error('Prompt is required');
    if (!repository) throw new Error('Repository is required');

    const body = {
      prompt: { text: prompt },
      repos: [{ url: repository, startingRef: branchName || ref }],
      autoCreatePR: autoCreatePr,
    };

    if (model) body.model = { id: model };

    const response = await request('/agents', 'POST', body);
    const agent = unwrapEnvelope(response, 'agent') || response;
    const run = Object.prototype.hasOwnProperty.call(response, 'run') ? response.run || null : null;
    return normalizeAgent(agent, run);
  }

  async function sendFollowup(agentId, prompt) {
    if (!prompt) throw new Error('Prompt is required');

    const id = resolveAgentId(agentId);
    await request(`/agents/${encodeURIComponent(id)}/runs`, 'POST', {
      prompt: { text: prompt },
    });
  }

  async function listModels() {
    return request('/models');
  }

  return {
    listAgents,
    getAgent,
    listRuns,
    getRun,
    getApiKeyInfo,
    listModels,
    listRepositories,
    normalizeAgent,
    getAllAgents,
    getAgentDetails,
    getAllRepositories,
    createAgent,
    sendFollowup,
    testConnection,
  };
}

export default createCursorService;
