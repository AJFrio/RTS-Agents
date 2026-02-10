import React from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { formatCount } from '../../utils/format.js';

const NAV_ITEMS = [
  { view: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { view: 'branches', icon: 'source', label: 'Repositories' },
  { view: 'computers', icon: 'computer', label: 'Computers' },
  { view: 'jira', icon: 'assignment', label: 'Jira' },
  { view: 'settings', icon: 'settings', label: 'Settings' },
];

const PROVIDERS = [
  { id: 'gemini', label: 'GEMINI CLI', dot: 'bg-emerald-500' },
  { id: 'jules', label: 'JULES', dot: 'bg-primary' },
  { id: 'cursor', label: 'CURSOR', dot: 'bg-blue-500' },
  { id: 'codex', label: 'CODEX', dot: 'bg-cyan-500' },
  { id: 'claude-cli', label: 'CLAUDE CLI', dot: 'bg-orange-500' },
  { id: 'claude-cloud', label: 'CLAUDE CLOUD', dot: 'bg-amber-500' },
];

const STATUS_FILTERS = [
  { id: 'running', label: 'RUNNING' },
  { id: 'completed', label: 'OP-COMPLETE' },
  { id: 'pending', label: 'PENDING_QUEUE', muted: true },
  { id: 'failed', label: 'FAILED/STOPPED', muted: true },
];

const STATUS_KEYS = ['gemini', 'jules', 'cursor', 'codex', 'claude-cli', 'claude-cloud', 'github'];

function statusText(s) {
  if (!s) return 'STBY';
  if (s.success || s.connected) return 'Connected';
  if (s.error === 'Not configured') return 'Offline';
  return 'Error';
}

function statusClass(s) {
  if (!s) return 'font-semibold text-slate-500';
  if (s.success || s.connected) return 'font-bold text-emerald-500';
  if (s.error === 'Not configured') return 'font-bold text-slate-500';
  return 'font-bold text-red-500';
}

export default function Sidebar() {
  const { state, dispatch, setView, api } = useApp();
  const { currentView, filters, counts, configuredServices, connectionStatus } = state;

  const handleFilterChange = (kind, key, checked) => {
    const next =
      kind === 'providers'
        ? { providers: { ...filters.providers, [key]: checked } }
        : { statuses: { ...filters.statuses, [key]: checked } };
    dispatch({ type: 'SET_FILTERS', payload: next });
    if (api?.saveFilters) {
      api.saveFilters({ ...filters, ...next }).catch(console.error);
    }
  };

  const showFilters = currentView === 'dashboard';

  return (
    <aside id="sidebar" className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark flex flex-col">
      <div className="p-6 border-b border-slate-200 dark:border-border-dark">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">grid_view</span>
          <div>
            <h1 className="font-semibold text-lg tracking-tight dark:text-white">RTS Agents</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">v1.0.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-8">
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-medium">Main Controls</div>
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ view, icon, label }) => (
              <li key={view}>
                <button
                  type="button"
                  data-view={view}
                  className={`nav-btn flex items-center gap-3 px-3 py-2 w-full text-left transition-all rounded-lg ${
                    currentView === view
                      ? 'active bg-primary text-black font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1A1A]'
                  }`}
                  onClick={() => setView(view)}
                >
                  <span className="material-symbols-outlined text-sm">{icon}</span>
                  <span className="text-sm font-medium tracking-wide">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {showFilters && (
          <div id="sidenav-providers">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-semibold">Providers</div>
            <ul className="space-y-3 px-2">
              {PROVIDERS.map(({ id, label, dot }) => {
                if (!configuredServices[id]) return null;
                return (
                  <li key={id} className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        id={`filter-${id}`}
                        checked={filters.providers[id] ?? true}
                        className="provider-filter form-checkbox h-3 w-3 bg-transparent border-primary text-primary focus:ring-0"
                        onChange={(e) => handleFilterChange('providers', id, e.target.checked)}
                      />
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="dark:text-slate-300">{label}</span>
                    </label>
                    <span id={`count-${id}`} className="technical-font text-slate-500">
                      {formatCount(counts[id] ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {showFilters && (
          <div id="sidenav-status">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-semibold">Operation Status</div>
            <ul className="space-y-3 px-2">
              {STATUS_FILTERS.map(({ id, label, muted }) => (
                <li key={id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    id={`filter-${id}`}
                    checked={filters.statuses[id] ?? true}
                    className="status-filter form-checkbox h-3 w-3 bg-transparent border-primary text-primary focus:ring-0"
                    onChange={(e) => handleFilterChange('statuses', id, e.target.checked)}
                  />
                  <span className={muted ? 'dark:text-slate-400' : 'dark:text-slate-300'}>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      <div id="connection-status" className="p-6 border-t border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-black/20">
        <div className="text-xs text-slate-400 mb-3 font-medium">Links</div>
        <div className="space-y-2">
          {STATUS_KEYS.map((key) => (
            <div key={key} className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500 font-medium">
                {key === 'claude-cli' ? 'Claude CLI' : key === 'claude-cloud' ? 'Claude Cloud' : key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <span id={`status-${key}`} className={statusClass(connectionStatus[key])} title={connectionStatus[key]?.error}>
                {statusText(connectionStatus[key])}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
