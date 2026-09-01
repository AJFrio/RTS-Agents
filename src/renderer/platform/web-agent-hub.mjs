/**
 * Web agent hub — the browser counterpart of the desktop agent pipeline
 * (agent-discovery-cache + main.js startPolling + provider-registry tasks).
 *
 * Owns:
 *   - provider fetchers → desktop Agent shape, Promise.allSettled so one bad
 *     provider never breaks the others (mirrors mobile AppContext refreshAgents)
 *   - the {unchanged, revision, full, agents, counts, errors} envelope
 *   - the polling timer (injectable timers for tests; no immediate tick at boot)
 *   - getAgentDetails spread-merge over the cached base agent
 *   - createTask/sendMessage dispatch incl. KV remote dispatch
 */

const REMOTE_TASK_REQUESTED_BY = 'web-pwa';

function buildCounts(agents) {
  const counts = {
    antigravity: 0,
    jules: 0,
    cursor: 0,
    codex: 0,
    'claude-cli': 0,
    'claude-cloud': 0,
    opencode: 0,
    total: agents.length,
  };
  for (const agent of agents) {
    if (counts[agent.provider] !== undefined) {
      counts[agent.provider] += 1;
    }
  }
  return counts;
}

function sortAgentsByDate(agents) {
  return [...agents].sort((a, b) => {
    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });
}

function normalizeModelIds(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  const models = [];
  for (const item of list) {
    const id = typeof item === 'string' ? item : item?.id || item?.name || item?.slug || '';
    if (id && !models.includes(id)) models.push(id);
  }
  return models;
}

export function createAgentHub({ storage, providers, timers, onTick }) {
  let revision = 0;
  let cachedAgents = [];
  let pollTimer = null;

  // ------------------------------------------------------------------
  // Provider fetchers
  // ------------------------------------------------------------------

  function buildFetchers() {
    const fetchers = [];
    if (storage.hasApiKey('jules')) {
      fetchers.push(['jules', () => providers.jules.getAllAgents()]);
    }
    if (storage.hasApiKey('cursor')) {
      fetchers.push(['cursor', () => providers.cursor.getAllAgents()]);
    }
    if (storage.hasApiKey('claude')) {
      fetchers.push(['claude-cloud', () => providers.claude.getAllAgents()]);
    }
    return fetchers;
  }

  async function fetchAllAgents() {
    const agents = [];
    const errors = [];

    const fetchers = buildFetchers();
    const settled = await Promise.allSettled(fetchers.map(([, fetch]) => fetch()));

    settled.forEach((entry, index) => {
      const [provider] = fetchers[index];
      if (entry.status === 'fulfilled') {
        agents.push(...entry.value);
      } else {
        errors.push({ provider, error: entry.reason?.message || 'Unknown error' });
      }
    });

    return { agents: sortAgentsByDate(agents), errors };
  }

  async function refreshCache() {
    const { agents, errors } = await fetchAllAgents();
    cachedAgents = agents;
    revision += 1;
    return { agents, errors };
  }

  async function getAgents({ sinceRevision = 0, force = false } = {}) {
    if (!force && sinceRevision === revision) {
      return { unchanged: true, revision };
    }
    const { agents, errors } = await refreshCache();
    return {
      revision,
      full: true,
      agents,
      counts: buildCounts(agents),
      errors,
    };
  }

  // ------------------------------------------------------------------
  // Polling lifecycle (desktop main.js startPolling counterpart)
  // ------------------------------------------------------------------

  function startPolling(interval) {
    stopPolling();
    if (!timers) return; // No timer source (Node test/SSR context) — polling stays off.
    const ms = Number(interval) > 0 ? Number(interval) : 30000;
    pollTimer = timers.setInterval(() => pollTick(), ms);
  }

  function stopPolling() {
    if (pollTimer) {
      timers.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollTick() {
    // Refresh the provider cache (bumps revision) before notifying
    // subscribers so their next getAgents() sees fresh data.
    await refreshCache();
    onTick();
  }

  // Boot: mirror desktop main.js — start the interval when auto-polling is
  // enabled. setInterval never fires immediately, so there is no boot tick.
  const bootSettings = storage.getSettings();
  if (timers && bootSettings.autoPolling) {
    startPolling(bootSettings.pollingInterval);
  }

  // ------------------------------------------------------------------
  // Agent details
  // ------------------------------------------------------------------

  async function getAgentDetails(provider, rawId) {
    let details;
    switch (provider) {
      case 'jules':
        details = await providers.jules.getAgentDetails(rawId);
        break;
      case 'cursor':
        details = await providers.cursor.getAgentDetails(rawId);
        break;
      case 'claude-cloud':
        details = await providers.claude.getAgentDetails(rawId);
        break;
      default:
        throw new Error(`Agent details are not available for ${provider} on web`);
    }

    // Spread-merge over the cached base agent so modal fields never undefined.
    const baseAgent =
      cachedAgents.find((agent) => agent.provider === provider && agent.rawId === rawId) || {};
    return { ...baseAgent, ...details };
  }

  // ------------------------------------------------------------------
  // Task creation / messaging
  // ------------------------------------------------------------------

  async function createRemoteTask(provider, options) {
    const repoPath = options.projectPath || options.repository;
    if (!repoPath) throw new Error('Repository path is required for remote tasks');

    const queue = await providers.cloudflareKv.enqueueDeviceTask(options.targetDeviceId, {
      tool: provider,
      repo: repoPath,
      prompt: options.prompt,
      model: options.model || null,
      requestedBy: REMOTE_TASK_REQUESTED_BY,
    });
    const queued = queue[queue.length - 1];

    return {
      success: true,
      task: {
        ...queued,
        status: 'queued',
        provider,
        name: `Remote ${provider} task`,
        summary: 'Queued on remote device',
      },
    };
  }

  async function createProviderTask(provider, options) {
    switch (provider) {
      case 'jules': {
        if (!storage.hasApiKey('jules')) throw new Error('Jules API key not configured');
        const julesOptions = { ...options, source: options.source || options.repository };
        const task = await providers.jules.createSession(julesOptions);
        return { success: true, task };
      }
      case 'cursor': {
        if (!storage.hasApiKey('cursor')) throw new Error('Cursor API key not configured');
        const task = await providers.cursor.createAgent(options);
        return { success: true, task };
      }
      case 'claude-cloud': {
        if (!storage.hasApiKey('claude')) throw new Error('Claude API key not configured');
        const task = await providers.claude.createTask(options);
        return { success: true, task };
      }
      case 'antigravity':
      case 'claude-cli':
      case 'codex':
      case 'opencode':
        throw new Error(`${provider} tasks are desktop-only on web`);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async function createTask(provider, options = {}) {
    try {
      if (options.targetDeviceId) {
        return await createRemoteTask(provider, options);
      }
      return await createProviderTask(provider, options);
    } catch (err) {
      console.error(`Error creating task for ${provider}:`, err);
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function sendMessage(provider, rawId, message) {
    try {
      switch (provider) {
        case 'jules':
          if (!storage.hasApiKey('jules')) throw new Error('Jules API key not configured');
          await providers.jules.sendFollowup(rawId, message);
          break;
        case 'cursor':
          if (!storage.hasApiKey('cursor')) throw new Error('Cursor API key not configured');
          await providers.cursor.sendFollowup(rawId, message);
          break;
        case 'claude-cloud':
          if (!storage.hasApiKey('claude')) throw new Error('Claude API key not configured');
          await providers.claude.sendFollowup(rawId, message);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
      return { success: true };
    } catch (err) {
      console.error(`Error sending message for ${provider}:`, err);
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  async function getProviderModels(provider) {
    try {
      switch (provider) {
        case 'cursor': {
          if (!storage.hasApiKey('cursor')) return { success: true, models: [], source: 'none' };
          return {
            success: true,
            models: normalizeModelIds(await providers.cursor.listModels()),
            source: 'api',
          };
        }
        case 'claude-cloud': {
          if (!storage.hasApiKey('claude')) return { success: true, models: [], source: 'none' };
          return {
            success: true,
            models: normalizeModelIds(await providers.claude.listModels()),
            source: 'api',
          };
        }
        default:
          return { success: true, models: [], source: 'none' };
      }
    } catch (err) {
      console.error(`Error listing models for ${provider}:`, err);
      return { success: false, models: [], source: 'none', error: err?.message || 'Unknown error' };
    }
  }

  return {
    getAgents,
    getAgentDetails,
    createTask,
    sendMessage,
    getProviderModels,
    startPolling,
    stopPolling,
    _pollTick: pollTick,
  };
}

export default createAgentHub;
