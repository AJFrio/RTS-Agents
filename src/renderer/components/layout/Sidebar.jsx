import React from 'react';
import { useApp } from '../../context/AppContext.jsx';

const NAV_ITEMS = [
  { view: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { view: 'agent', icon: 'smart_toy', label: 'Agent Chat' },
  { view: 'branches', icon: 'source', label: 'Repositories' },
  { view: 'pull-requests', icon: 'merge_type', label: 'Pull Requests' },
  { view: 'computers', icon: 'computer', label: 'Computers' },
  { view: 'jira', icon: 'assignment', label: 'Jira' },
  { view: 'settings', icon: 'settings', label: 'Settings' },
];

export default function Sidebar() {
  const { state, setView, openNewTaskModal } = useApp();
  const { currentView } = state;

  return (
    <aside
      id="sidebar"
      className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark flex flex-col"
    >
      <div className="p-4 border-b border-slate-200 dark:border-border-dark">
        <h1 className="font-semibold text-lg tracking-tight dark:text-white">RTS Agents</h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Agent operations</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ view, icon, label }) => (
            <li key={view}>
              <button
                type="button"
                data-view={view}
                className={`nav-btn flex items-center gap-3 px-3 py-2.5 w-full text-left transition-all rounded-lg ${
                  currentView === view
                    ? 'active bg-primary text-black font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-card-dark'
                }`}
                onClick={() => setView(view)}
              >
                <span className="material-symbols-outlined text-sm">{icon}</span>
                <span className="text-sm font-medium tracking-wide">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-border-dark">
        <button
          type="button"
          id="new-task-btn"
          className="w-full bg-primary text-black flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium tracking-wide rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200"
          onClick={openNewTaskModal}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Task
        </button>
      </div>
    </aside>
  );
}
