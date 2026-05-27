import React, { createContext, useContext, useReducer, useMemo } from 'react';
import { useElectronAPI } from './ElectronAPI.jsx';
import { initialState, appReducer, VIEWS } from './app-state.js';
import { useAppData } from './hooks/use-app-data.js';
import { useAppGithub } from './hooks/use-app-github.js';
import { useAppEffects } from './hooks/use-app-effects.js';
import { useAppModals } from './hooks/use-app-modals.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const api = useElectronAPI();

  const {
    loadSettings,
    loadAgents,
    checkConnectionStatus,
    fetchComputers,
    loadRemoteQueueActivity,
  } = useAppData(api, state, dispatch);

  const { loadBranches, loadAllPrs, removePr } = useAppGithub(api, dispatch);
  const modals = useAppModals(dispatch);

  useAppEffects({
    api,
    state,
    dispatch,
    loadSettings,
    loadAgents,
    checkConnectionStatus,
    fetchComputers,
    loadRemoteQueueActivity,
  });

  const value = useMemo(
    () => ({
      state,
      dispatch,
      api,
      loadSettings,
      loadAgents,
      checkConnectionStatus,
      fetchComputers,
      loadRemoteQueueActivity,
      loadBranches,
      loadAllPrs,
      removePr,
      ...modals,
    }),
    [
      state,
      api,
      loadSettings,
      loadAgents,
      checkConnectionStatus,
      fetchComputers,
      loadRemoteQueueActivity,
      loadBranches,
      loadAllPrs,
      removePr,
      modals,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { VIEWS };
export default AppContext;
