import React, { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { debounce } from '../../utils/debounce.js';

const VIEW_TITLES = {
  dashboard: 'Agent Dashboard',
  branches: 'Repositories',
  computers: 'Computers',
  jira: 'Jira',
  settings: 'Settings',
};

export default function Header() {
  const { state, dispatch, setView, loadAgents, fetchComputers, loadBranches, openNewTaskModal } = useApp();
  const { currentView, counts, filters, refreshing } = state;

  const handleSearch = useMemo(
    () =>
      debounce((e) => {
        dispatch({ type: 'SET_FILTERS', payload: { search: e.target.value.toLowerCase() } });
      }, 300),
    [dispatch]
  );

  const handleRefresh = useCallback(() => {
    if (currentView === 'dashboard') loadAgents(false);
    else if (currentView === 'branches') loadBranches();
    else if (currentView === 'computers') fetchComputers();
    else if (currentView === 'jira') setView('jira');
  }, [currentView, loadAgents, setView, fetchComputers, loadBranches]);

  const showHeaderActions = currentView !== 'settings';
  const taskCount =
    currentView === 'computers'
      ? `${state.computers.list.length} Computer${state.computers.list.length !== 1 ? 's' : ''}`
      : `${counts.total ?? 0} Task${(counts.total ?? 0) !== 1 ? 's' : ''}`;

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-slate-200 dark:border-border-dark bg-white/50 dark:bg-sidebar-dark/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-baseline gap-4">
        <h2 id="view-title" className="text-xl font-display font-bold uppercase tracking-tight dark:text-white">
          {VIEW_TITLES[currentView] || 'Dashboard'}
        </h2>
        <span id="total-count" className="technical-font text-slate-400 dark:text-slate-500">
          {taskCount}
        </span>
      </div>
      {showHeaderActions && (
        <div className="flex items-center gap-4">
          {currentView === 'dashboard' && (
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
                <span className="material-symbols-outlined text-sm">search</span>
              </span>
              <input
                type="text"
                id="search-input"
                placeholder="SEARCH TASKS"
                defaultValue={filters.search}
                className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs technical-font py-2 pl-10 pr-4 w-64 rounded-lg text-slate-800 dark:text-white placeholder:text-slate-500 transition-all duration-200"
                style={{ paddingLeft: '2.5rem', textAlign: 'right' }}
                onChange={handleSearch}
              />
            </div>
          )}
          <button
            type="button"
            id="new-task-btn"
            className="bg-primary text-black flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            onClick={openNewTaskModal}
          >
            <span className="material-symbols-outlined text-sm">add</span>
            NEW_TASK
          </button>
          <button
            type="button"
            id="refresh-btn"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-60"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <span
              id="refresh-icon"
              className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}
            >
              refresh
            </span>
            SYNC
          </button>
        </div>
      )}
    </header>
  );
}
