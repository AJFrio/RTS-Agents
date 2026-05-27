import { useEffect } from 'react';

/**
 * Bootstrap, polling refresh, and agent filter side effects.
 */
export function useAppEffects({
  api,
  state,
  dispatch,
  loadSettings,
  loadAgents,
  checkConnectionStatus,
  fetchComputers,
  loadRemoteQueueActivity,
}) {
  useEffect(() => {
    if (!api) return;
    let mounted = true;
    (async () => {
      await loadSettings();
      if (!mounted) return;
      await loadAgents();
      if (!mounted) return;
      await checkConnectionStatus();
      fetchComputers();
      loadRemoteQueueActivity();
    })();
    return () => {
      mounted = false;
    };
  }, [api, loadSettings, loadAgents, checkConnectionStatus, fetchComputers, loadRemoteQueueActivity]);

  useEffect(() => {
    if (!api?.onRefreshTick) return;
    const unsubscribe = api.onRefreshTick(() => {
      loadAgents(true);
      loadRemoteQueueActivity();
    });
    return unsubscribe;
  }, [api, loadAgents, loadRemoteQueueActivity]);

  useEffect(() => {
    const { agents, filters } = state;
    const { providers, statuses, search } = filters;
    const filtered = agents.filter((agent) => {
      if (!providers[agent.provider]) return false;
      const statusKey = agent.status === 'stopped' ? 'failed' : agent.status;
      if (!statuses[statusKey]) return false;
      if (search) {
        const searchFields = [agent.name, agent.prompt, agent.repository, agent.summary]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchFields.includes(search)) return false;
      }
      return true;
    });
    dispatch({ type: 'SET_FILTERED_AGENTS', payload: filtered });
    dispatch({ type: 'SET_PAGINATION', payload: { currentPage: 1 } });
  }, [state.agents, state.filters, dispatch]);
}
