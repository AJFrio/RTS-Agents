import React, { useCallback, useMemo } from 'react';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import FilterDropdown from '../ui/FilterDropdown.jsx';
import { IconSync, IconPlus } from '../ui/icons.jsx';
import { debounce } from '../../utils/debounce.js';

const VIEW_TITLES = {
  agent: 'Agent',
  'new-task': 'New Task',
  plugins: 'Plugins',
  devices: 'Devices',
  'task-detail': 'Task',
  dashboard: 'All Tasks',
  branches: 'Repositories',
  'pull-requests': 'Pull Requests',
  jira: 'Jira',
  settings: 'Settings',
};

function getActiveFilterCount(filters) {
  const providers = Object.values(filters.providers || {}).filter((enabled) => !enabled).length;
  const statuses = Object.values(filters.statuses || {}).filter((enabled) => !enabled).length;
  return providers + statuses;
}

function getPrRepoName(pr) {
  return pr?.base?.repo?.full_name || pr?.repository?.full_name || 'Unknown Repository';
}

export default function Header() {
  const state = useAppState();
  const {
    dispatch,
    loadAgents,
    fetchComputers,
    loadBranches,
    loadAllPrs,
    openCreateRepoModal,
    openPrRepoFilter,
    loadRemoteQueueActivity,
  } = useAppActions();
  const { currentView, counts, filters, refreshing, github, selectedTask } = state;

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
    else if (currentView === 'devices') fetchComputers();
  }, [
    currentView,
    loadAgents,
    fetchComputers,
    loadBranches,
    loadAllPrs,
    loadRemoteQueueActivity,
  ]);

  const showHeaderActions =
    ['dashboard', 'branches', 'pull-requests', 'devices'].includes(currentView);
  const activeFilterCount = getActiveFilterCount(filters);
  const hiddenPrRepoCount = github?.hiddenPrRepos?.length || 0;
  const visiblePrCount = useMemo(() => {
    const allPrs = github?.allPrs || [];
    if (hiddenPrRepoCount === 0) return allPrs.length;

    const hiddenRepos = new Set(github?.hiddenPrRepos || []);
    return allPrs.filter((pr) => !hiddenRepos.has(getPrRepoName(pr))).length;
  }, [github?.allPrs, github?.hiddenPrRepos, hiddenPrRepoCount]);

  const isRefreshing =
    currentView === 'branches'
      ? github?.loadingRepos || false
      : currentView === 'pull-requests'
        ? github?.loadingAllPrs || false
        : refreshing;

  const headerTitle =
    currentView === 'task-detail'
      ? selectedTask?.name || 'Task'
      : VIEW_TITLES[currentView] || 'Dashboard';

  const taskCount =
    currentView === 'devices'
      ? `${state.computers.list.length} Device${state.computers.list.length !== 1 ? 's' : ''}`
      : currentView === 'branches'
        ? `${github?.repos?.length || 0} Repo${(github?.repos?.length || 0) !== 1 ? 's' : ''}`
        : currentView === 'pull-requests'
          ? hiddenPrRepoCount > 0
            ? `${visiblePrCount} of ${github?.allPrs?.length || 0} PRs`
            : `${github?.allPrs?.length || 0} PR${(github?.allPrs?.length || 0) !== 1 ? 's' : ''}`
          : currentView === 'jira'
            ? `${state.jira?.issues?.length || 0} Issue${(state.jira?.issues?.length || 0) !== 1 ? 's' : ''}`
            : ['agent', 'new-task', 'plugins', 'settings', 'task-detail'].includes(currentView)
              ? ''
              : `${counts.total ?? 0} Task${(counts.total ?? 0) !== 1 ? 's' : ''}`;

  return (
    <header className="sticky top-0 z-10 flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-light bg-background-light/90 px-3 py-2 backdrop-blur-sm dark:border-border-dark dark:bg-background-dark/90 sm:h-12 sm:flex-nowrap sm:px-6 sm:py-0">
      <div className="flex min-w-0 items-baseline gap-2 sm:gap-4">
        <h2
          id="view-title"
          className="truncate text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100"
        >
          {headerTitle}
        </h2>
        {taskCount && (
          <span id="total-count" className="shrink-0 text-[12px] text-neutral-500 dark:text-neutral-400">
            {taskCount}
          </span>
        )}
      </div>
      {showHeaderActions && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
          {currentView === 'dashboard' && (
            <>
              <div className="relative order-3 w-full sm:order-none sm:w-auto">
                <input
                  type="text"
                  id="search-input"
                  placeholder="Search tasks"
                  defaultValue={filters.search}
                  className="w-full rounded-md py-1.5 pl-8 text-[13px] sm:w-40 md:w-56"
                  onChange={handleSearch}
                />
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </div>
              <FilterDropdown />
              {activeFilterCount > 0 && (
                <span className="hidden text-[11px] font-medium text-neutral-600 dark:text-neutral-300 sm:inline">
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
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-light px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={openCreateRepoModal}
              >
                <IconPlus size={13} />
                <span className="hidden sm:inline">New Repo</span>
              </button>
              <button
                type="button"
                id="refresh-branches-btn"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-light px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-60 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <IconSync size={13} className={isRefreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </>
          ) : (
            <>
              {currentView === 'pull-requests' && (
                <button
                  type="button"
                  id="pr-repo-filter-btn"
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors active:scale-[0.98] ${
                    hiddenPrRepoCount > 0
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                      : 'border-border-light text-neutral-700 hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                  onClick={openPrRepoFilter}
                  aria-label="Filter pull request repositories"
                >
                  <span className="sm:hidden">
                    Filter{hiddenPrRepoCount > 0 ? ` (${hiddenPrRepoCount})` : ''}
                  </span>
                  <span className="hidden sm:inline">
                    FILTER{hiddenPrRepoCount > 0 ? ` (${hiddenPrRepoCount})` : ''}
                  </span>
                </button>
              )}
              <button
                type="button"
                id="refresh-btn"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border-light px-2.5 py-1.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.98] disabled:opacity-60 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <IconSync
                  size={13}
                  id="refresh-icon"
                  className={isRefreshing ? 'animate-spin' : ''}
                />
                <span className="hidden sm:inline">SYNC</span>
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
