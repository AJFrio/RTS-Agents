import { useEffect, useRef } from 'react';

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
  const bootstrapActionsRef = useRef({
    loadSettings,
    loadAgents,
    checkConnectionStatus,
    fetchComputers,
    loadRemoteQueueActivity,
  });
  const previousFiltersRef = useRef(state.filters);

  useEffect(() => {
    bootstrapActionsRef.current = {
      loadSettings,
      loadAgents,
      checkConnectionStatus,
      fetchComputers,
      loadRemoteQueueActivity,
    };
  }, [loadSettings, loadAgents, checkConnectionStatus, fetchComputers, loadRemoteQueueActivity]);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    (async () => {
      const actions = bootstrapActionsRef.current;
      await actions.loadSettings();
      if (!mounted) return;
      await actions.loadAgents();
      if (!mounted) return;
      await actions.checkConnectionStatus();
      actions.fetchComputers();
      actions.loadRemoteQueueActivity();
    })();
    return () => {
      mounted = false;
    };
  }, [api]);

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
    if (previousFiltersRef.current !== filters) {
      dispatch({ type: 'SET_PAGINATION', payload: { currentPage: 1 } });
      previousFiltersRef.current = filters;
    }
  }, [state.agents, state.filters, dispatch]);
}
