import React, { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import FilterDropdown from '../ui/FilterDropdown.jsx';
import { debounce } from '../../utils/debounce.js';

const VIEW_TITLES = {
  agent: 'Agent Chat',
  dashboard: 'Agent Dashboard',
  branches: 'Repositories',
  'pull-requests': 'Pull Requests',
  computers: 'Computers',
  jira: 'Jira',
  settings: 'Settings',
};

function getActiveFilterCount(filters) {
  const providers = Object.values(filters.providers || {}).filter((enabled) => !enabled).length;
  const statuses = Object.values(filters.statuses || {}).filter((enabled) => !enabled).length;
  return providers + statuses;
}

export default function Header() {
  const {
    state,
    dispatch,
    setView,
    loadAgents,
    fetchComputers,
    loadBranches,
    loadAllPrs,
    openCreateRepoModal,
    checkConnectionStatus,
    loadRemoteQueueActivity,
  } = useApp();
  const { currentView, counts, filters, refreshing, github } = state;

  const handleSearch = useMemo(
    () =>
      debounce((e) => {
        dispatch({ type: 'SET_FILTERS', payload: { search: e.target.value.toLowerCase() } });
      }, 300),
    [dispatch]
  );

  const handleRefresh = useCallback(() => {
    if (currentView === 'dashboard') {
      loadAgents({ silent: false, force: true });
      loadRemoteQueueActivity();
    } else if (currentView === 'branches') loadBranches();
    else if (currentView === 'pull-requests') loadAllPrs();
    else if (currentView === 'computers') fetchComputers();
    else if (currentView === 'agent') void checkConnectionStatus();
    else if (currentView === 'jira') setView('jira');
  }, [
    currentView,
    loadAgents,
    setView,
    fetchComputers,
    loadBranches,
    loadAllPrs,
    loadRemoteQueueActivity,
    checkConnectionStatus,
  ]);

  const showHeaderActions = currentView !== 'settings' && currentView !== 'agent';
  const activeFilterCount = getActiveFilterCount(filters);

  const isRefreshing =
    currentView === 'branches'
      ? github?.loadingRepos || false
      : currentView === 'pull-requests'
        ? github?.loadingAllPrs || false
        : refreshing;

  const taskCount =
    currentView === 'agent'
      ? state.settings?.selectedModel || 'No model selected'
      : currentView === 'settings'
        ? ''
        : currentView === 'computers'
          ? `${state.computers.list.length} Computer${state.computers.list.length !== 1 ? 's' : ''}`
          : currentView === 'branches'
            ? `${github?.repos?.length || 0} Repo${(github?.repos?.length || 0) !== 1 ? 's' : ''}`
            : currentView === 'pull-requests'
              ? `${github?.allPrs?.length || 0} PR${(github?.allPrs?.length || 0) !== 1 ? 's' : ''}`
              : currentView === 'jira'
                ? `${state.jira?.issues?.length || 0} Issue${(state.jira?.issues?.length || 0) !== 1 ? 's' : ''}`
                : `${counts.total ?? 0} Task${(counts.total ?? 0) !== 1 ? 's' : ''}`;

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-slate-200 dark:border-border-dark bg-white/80 dark:bg-sidebar-dark/80 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-baseline gap-4">
        <h2
          id="view-title"
          className="text-xl font-display font-bold tracking-tight text-slate-900 dark:text-white"
        >
          {VIEW_TITLES[currentView] || 'Dashboard'}
        </h2>
        {taskCount && (
          <span id="total-count" className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {taskCount}
          </span>
        )}
      </div>
      {showHeaderActions && (
        <div className="flex items-center gap-4">
          {currentView === 'dashboard' && (
            <>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
                  <span className="material-symbols-outlined text-sm">search</span>
                </span>
                <input
                  type="text"
                  id="search-input"
                  placeholder="Search tasks"
                  defaultValue={filters.search}
                  className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm py-2 pl-10 pr-4 w-64 rounded-lg text-slate-800 dark:text-white placeholder:text-slate-500 transition-all duration-200"
                  onChange={handleSearch}
                />
              </div>
              <FilterDropdown />
              {activeFilterCount > 0 && (
                <span className="text-xs font-medium text-primary">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                </span>
              )}
            </>
          )}

          {currentView === 'branches' ? (
            <>
              <button
                type="button"
                id="create-repo-btn"
                className="bg-primary text-black flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
                onClick={openCreateRepoModal}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                New Repo
              </button>
              <button
                type="button"
                id="refresh-branches-btn"
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-60"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <span
                  id="refresh-icon"
                  className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}
                >
                  refresh
                </span>
                Refresh
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                id="refresh-btn"
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-60"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <span
                  id="refresh-icon"
                  className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}
                >
                  refresh
                </span>
                SYNC
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
