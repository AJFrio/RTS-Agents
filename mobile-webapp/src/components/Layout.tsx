/**
 * Layout Component
 * 
 * Mobile-first responsive layout with header and bottom navigation
 */

import React from 'react';
import { useApp } from '../store/AppContext';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { state, dispatch, refreshAgents } = useApp();

  const getViewTitle = () => {
    switch (state.currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'branches':
        return 'Branches';
      case 'computers':
        return 'Computers';
      case 'jira':
        return 'Jira';
      case 'settings':
        return 'Settings';
      default:
        return 'RTS Agents';
    }
  };

  const handleRefresh = () => {
    refreshAgents();
  };

  const handleNewTask = () => {
    dispatch({ type: 'SET_SHOW_NEW_TASK_MODAL', payload: true });
  };

  return (
    <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-200">
      {/* Header */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-border-dark bg-white/90 dark:bg-sidebar-dark/90 backdrop-blur-lg safe-top z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">grid_view</span>
          <h1 className="font-semibold text-sm tracking-tight">{getViewTitle()}</h1>
          {state.currentView === 'dashboard' && (
            <span className="text-xs text-slate-500 ml-2">
              {state.counts.total} Tasks
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {state.currentView === 'dashboard' && (
            <>
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={state.loading}
                className="p-2 text-slate-500 hover:text-primary transition-colors duration-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Refresh"
              >
                <span className={`material-symbols-outlined text-xl ${state.loading ? 'animate-spin' : ''}`}>
                  sync
                </span>
              </button>

              {/* New Task Button */}
              <button
                onClick={handleNewTask}
                className="flex items-center gap-1.5 bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md active:scale-95 transition-all duration-200"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                New
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
