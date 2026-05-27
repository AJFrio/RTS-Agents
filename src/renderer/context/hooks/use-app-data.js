import { useCallback } from 'react';

/**
 * Settings, agents, connection status, computers, and remote queue loaders.
 */
export function useAppData(api, state, dispatch) {
  const loadSettings = useCallback(async () => {
    if (!api) return;
    try {
      const result = await api.getSettings();
      dispatch({
        type: 'SET_SETTINGS',
        payload: {
          pollingInterval: result.settings?.pollingInterval ?? 30000,
          autoPolling: result.settings?.autoPolling !== false,
          antigravityPaths: result.settings?.antigravityPaths ?? result.antigravityPaths ?? [],
          claudePaths: result.settings?.claudePaths ?? [],
          cursorPaths: result.settings?.cursorPaths ?? [],
          codexPaths: result.settings?.codexPaths ?? [],
          opencodePaths: result.settings?.opencodePaths ?? [],
          githubPaths: result.githubPaths ?? result.settings?.githubPaths ?? [],
          theme: result.settings?.theme ?? 'system',
          displayMode: result.settings?.displayMode ?? 'fullscreen',
          jiraBaseUrl: result.jiraBaseUrl ?? '',
          selectedModel: result.selectedModel ?? result.settings?.selectedModel ?? 'openrouter/openai/gpt-4o',
        },
      });
      dispatch({
        type: 'SET_CONFIGURED_SERVICES',
        payload: {
          antigravity: result.antigravityInstalled || (result.antigravityPaths?.length > 0) || false,
          jules: !!result.apiKeys?.jules,
          cursor: !!result.apiKeys?.cursor || (result.cursorPaths?.length > 0) || false,
          codex: !!result.apiKeys?.codex || result.codexInstalled || (result.codexPaths?.length > 0) || false,
          'claude-cli': result.claudeCliInstalled || (result.claudePaths?.length > 0) || false,
          'claude-cloud': result.claudeCloudConfigured || !!result.apiKeys?.claude,
          opencode: !!result.opencodeInstalled || (result.opencodePaths?.length > 0) || false,
          openrouter: !!result.apiKeys?.openrouter,
          github: !!result.apiKeys?.github,
          jira: !!result.apiKeys?.jira && !!(result.jiraBaseUrl || ''),
        },
      });
      dispatch({
        type: 'SET_CAPABILITIES',
        payload: {
          antigravity: { cloud: false, local: !!(result.antigravityInstalled || result.antigravityPaths?.length) },
          jules: { cloud: !!result.apiKeys?.jules, local: false },
          cursor: { cloud: !!result.apiKeys?.cursor, local: !!(result.cursorPaths?.length) },
          codex: { cloud: !!result.apiKeys?.codex, local: !!(result.codexInstalled || result.codexPaths?.length) },
          claude: {
            cloud: !!(result.claudeCloudConfigured || result.apiKeys?.claude),
            local: !!(result.claudeCliInstalled || result.claudePaths?.length),
          },
          opencode: { cloud: false, local: !!(result.opencodeInstalled || result.opencodePaths?.length) },
          github: { cloud: !!result.apiKeys?.github, local: !!(result.githubPaths?.length) },
        },
      });
      dispatch({
        type: 'SET_SERVICE_INFO',
        payload: {
          apiKeys: result.apiKeys ?? {},
          cloudflare: result.cloudflare ?? { configured: false, accountId: '', namespaceTitle: 'rtsa' },
          installations: {
            antigravity: !!result.antigravityInstalled,
            claude: !!result.claudeCliInstalled,
            codex: !!result.codexInstalled,
            opencode: !!result.opencodeInstalled,
          },
        },
      });
      if (result.localDeviceId) {
        dispatch({ type: 'SET_LOCAL_DEVICE_ID', payload: result.localDeviceId });
      }
      if (result.filters?.providers) {
        dispatch({ type: 'SET_FILTERS', payload: { providers: result.filters.providers } });
      }
      if (result.filters?.statuses) {
        dispatch({ type: 'SET_FILTERS', payload: { statuses: result.filters.statuses } });
      }
      if (typeof result.filters?.search === 'string') {
        dispatch({ type: 'SET_FILTERS', payload: { search: result.filters.search } });
      }
      dispatch({
        type: 'SET_COMPUTERS',
        payload: { configured: !!(result.cloudflare?.configured || result.apiKeys?.cloudflare) },
      });
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }, [api, dispatch]);

  const loadAgents = useCallback(
    async (arg = false) => {
      if (!api) return;
      const silent = typeof arg === 'boolean' ? arg : arg.silent ?? false;
      const force = typeof arg === 'object' && arg !== null ? arg.force ?? false : false;

      if (!silent && state.agents.length === 0) {
        dispatch({ type: 'SET_LOADING', payload: true });
      }
      dispatch({ type: 'SET_REFRESHING', payload: true });
      try {
        const result = await api.getAgents({
          sinceRevision: state.agentListRevision,
          force: force || (!silent && state.agents.length === 0),
        });

        if (result?.unchanged) {
          return;
        }

        const payload = {
          revision: result.revision,
          counts: result.counts ?? state.counts,
          errors: result.errors ?? [],
        };

        if (result.full) {
          dispatch({
            type: 'SET_AGENTS',
            payload: {
              ...payload,
              agents: result.agents ?? [],
            },
          });
          return;
        }

        if (result.delta) {
          dispatch({
            type: 'MERGE_AGENTS_DELTA',
            payload: {
              ...payload,
              delta: result.delta,
            },
          });
        }
      } catch (err) {
        console.error('Error loading agents:', err);
        dispatch({ type: 'SET_AGENTS', payload: { errors: [{ provider: 'system', error: err.message }] } });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_REFRESHING', payload: false });
      }
    },
    [api, dispatch, state.agents.length, state.agentListRevision, state.counts]
  );

  const checkConnectionStatus = useCallback(async () => {
    if (!api) return;
    try {
      const status = await api.getConnectionStatus();
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status ?? {} });
    } catch (err) {
      console.error('Error checking connection status:', err);
    }
  }, [api, dispatch]);

  const fetchComputers = useCallback(async () => {
    if (!api?.listComputers) return;
    try {
      const result = await api.listComputers();
      if (result?.success) {
        dispatch({
          type: 'SET_COMPUTERS',
          payload: { list: result.computers ?? [], configured: !!result.configured },
        });
      }
    } catch (err) {
      console.warn('Background computer fetch failed:', err);
    }
  }, [api, dispatch]);

  const loadRemoteQueueActivity = useCallback(async () => {
    if (!api?.getQueueActivity) return;
    dispatch({ type: 'SET_REMOTE_QUEUE', payload: { loading: true } });
    try {
      const result = await api.getQueueActivity();
      if (result?.success) {
        dispatch({
          type: 'SET_REMOTE_QUEUE',
          payload: {
            loading: false,
            devices: result.devices ?? [],
            configured: result.configured !== false,
            updatedAt: result.updatedAt || new Date().toISOString(),
            lastError: null,
          },
        });
      } else {
        dispatch({
          type: 'SET_REMOTE_QUEUE',
          payload: {
            loading: false,
            devices: [],
            lastError: result?.error || 'Failed to load queue activity',
          },
        });
      }
    } catch (err) {
      dispatch({
        type: 'SET_REMOTE_QUEUE',
        payload: { loading: false, lastError: err?.message || 'Failed to load queue activity' },
      });
    }
  }, [api, dispatch]);

  return {
    loadSettings,
    loadAgents,
    checkConnectionStatus,
    fetchComputers,
    loadRemoteQueueActivity,
  };
}
