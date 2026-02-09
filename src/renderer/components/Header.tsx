import React from 'react';
import { useApp } from '../context/AppContext';

interface HeaderProps {
  onNewTask: () => void;
  onRefresh: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNewTask, onRefresh }) => {
  const { currentView, counts, filters, setFilter } = useApp();

  const getTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Agent Dashboard';
      case 'branches': return 'Repositories';
      case 'computers': return 'Computers';
      case 'jira': return 'Jira';
      case 'settings': return 'Settings';
      default: return 'Dashboard';
    }
  };

  const getCount = () => {
    switch (currentView) {
      case 'dashboard': return `${counts.total} Tasks`;
      case 'computers': return `${counts.total} Computers`; // Logic might differ, need to check
      // For others, it might be dynamic based on content
      default: return '';
    }
  };

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-slate-200 dark:border-border-dark bg-white/50 dark:bg-sidebar-dark/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-baseline gap-4">
        <h2 className="text-xl font-display font-bold uppercase tracking-tight dark:text-white">{getTitle()}</h2>
        <span className="technical-font text-slate-400 dark:text-slate-500">{getCount()}</span>
      </div>
      <div className="flex items-center gap-4">
        {/* Search - only for dashboard for now */}
        {currentView === 'dashboard' && (
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-sm">search</span>
            </span>
            <input
              type="text"
              placeholder="SEARCH TASKS"
              value={filters.search}
              onChange={(e) => setFilter('search', '', e.target.value)}
              className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs technical-font py-2 pl-10 pr-4 w-64 rounded-lg text-slate-800 dark:text-white placeholder:text-slate-500 transition-all duration-200 text-right"
            />
          </div>
        )}

        {/* New Task Button - only for dashboard? Or global? In app.js it seems global */}
        <button
          onClick={onNewTask}
          className="bg-primary text-black flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          NEW_TASK
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          SYNC
        </button>
      </div>
    </header>
  );
};

export default Header;
