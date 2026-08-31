/**
 * Background pre-fetch cache for agent/task details.
 *
 * Primes details for currently-running agents so opening AgentModal renders
 * instantly; the modal still performs its live fetch to refresh. Pure ESM,
 * no electron imports — the fetcher is injectable so this stays testable
 * (precedent: tests/unit/web-platform.verify.mjs).
 */

/**
 * Fetch details for one agent, mirroring AgentModal's jules-vs-generic
 * branch, and normalize the envelope (`result?.details ?? result`).
 *
 * @param {object} api Preload bridge (window.electronAPI shape).
 * @param {object} agent Agent from state.agents.
 * @returns {Promise<object|null>} Normalized details, or null when the api
 *   surface cannot serve the request.
 */
export async function fetchAgentDetails(api, agent) {
  const isJules = agent.provider === 'jules';
  const rawId = agent.rawId || agent.id;

  if (isJules && api?.getJulesAgentDetailsText) {
    const julesSessionId = String(rawId || '').replace(/^jules-/, '');
    if (julesSessionId) {
      const result = await api.getJulesAgentDetailsText(julesSessionId);
      return result?.details ?? result;
    }
  }

  if (!api?.getAgentDetails) return null;
  const result = await api.getAgentDetails(agent.provider, rawId, agent.filePath);
  return result?.details ?? result;
}

/**
 * Create an insertion-ordered details cache with fire-and-forget priming.
 *
 * @param {object} [options]
 * @param {(api: object, agent: object) => Promise<object>} [options.fetchDetails]
 *   Detail fetcher; defaults to {@link fetchAgentDetails}.
 * @param {number} [options.maxEntries=100] Evict oldest beyond this cap.
 * @param {object|null} [options.api] Api passed through to fetchDetails.
 * @returns {{prime: Function, get: Function, has: Function, clear: Function}}
 */
export function createAgentDetailsCache({
  fetchDetails = fetchAgentDetails,
  maxEntries = 100,
  api = null,
} = {}) {
  const entries = new Map(); // `${provider}:${rawId}` -> normalized details
  const inFlight = new Set(); // keys currently being fetched

  const keyFor = (provider, rawId) => `${provider}:${rawId}`;

  function trim() {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
    }
  }

  /**
   * Pre-fetch details for every running agent not yet cached or in flight.
   * Never throws and never blocks: failures are warned and dropped.
   */
  function prime(agents) {
    if (!Array.isArray(agents)) return;
    const targets = [];
    for (const agent of agents) {
      if (!agent || agent.status !== 'running') continue;
      const key = keyFor(agent.provider, agent.rawId || agent.id);
      if (entries.has(key) || inFlight.has(key)) continue;
      inFlight.add(key);
      targets.push({ agent, key });
    }
    if (targets.length === 0) return;

    const tasks = targets.map(async ({ agent, key }) => {
      try {
        const details = await fetchDetails(api, agent);
        entries.set(key, details ?? null);
        trim();
      } catch (err) {
        console.warn(`[agent-details-cache] prefetch failed for ${key}:`, err?.message || err);
      } finally {
        inFlight.delete(key);
      }
    });
    void Promise.allSettled(tasks);
  }

  /** Cached details for an agent, or null on a miss. */
  function get(provider, rawId) {
    return entries.get(keyFor(provider, rawId)) ?? null;
  }

  /** Whether details are cached for an agent. */
  function has(provider, rawId) {
    return entries.has(keyFor(provider, rawId));
  }

  /** Drop every cached entry. */
  function clear() {
    entries.clear();
  }

  return { prime, get, has, clear };
}
