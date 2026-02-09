import React from 'react';
import { useApp } from '../context/AppContext';

const Sidebar: React.FC = () => {
  const {
    currentView, setView,
    filters, setFilter,
    counts, configuredServices, connectionStatus
  } = useApp();

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'branches', icon: 'source', label: 'Repositories' },
    { id: 'computers', icon: 'computer', label: 'Computers' },
    { id: 'jira', icon: 'assignment', label: 'Jira' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  const providers = [
    { id: 'gemini', label: 'GEMINI CLI', color: 'bg-emerald-500' },
    { id: 'jules', label: 'JULES', color: 'bg-primary' },
    { id: 'cursor', label: 'CURSOR', color: 'bg-blue-500' },
    { id: 'codex', label: 'CODEX', color: 'bg-cyan-500' },
    { id: 'claude-cli', label: 'CLAUDE CLI', color: 'bg-orange-500' },
    { id: 'claude-cloud', label: 'CLAUDE CLOUD', color: 'bg-amber-500' },
  ];

  const statuses = [
    { id: 'running', label: 'RUNNING' },
    { id: 'completed', label: 'OP-COMPLETE' },
    { id: 'pending', label: 'PENDING_QUEUE' },
    { id: 'failed', label: 'FAILED/STOPPED' },
  ];

  const getConnectionStatus = (provider: string) => {
     // Convert provider to property name (e.g. 'claude-cli' -> 'claude-cli')
     // The connectionStatus object keys match the provider IDs mostly
     const status = connectionStatus[provider];
     if (status?.connected || status?.success) return <span className="font-semibold text-emerald-500">CONNECTED</span>;
     if (status?.error === 'Not configured') return <span className="font-semibold text-slate-500">OFFLINE</span>;
     return <span className="font-semibold text-red-500" title={status?.error}>ERROR</span>;
  };

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-slate-200 dark:border-border-dark">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">grid_view</span>
          <div>
            <h1 className="font-semibold text-lg tracking-tight dark:text-white">RTS Agents</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">v1.0.0</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        <div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-medium">Main Controls</div>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setView(item.id)}
                  className={`nav-btn flex items-center gap-3 px-3 py-2 w-full text-left transition-all rounded-lg ${
                    currentView === item.id
                      ? 'active bg-primary text-black font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1A1A1A]'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{item.icon}</span>
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Provider Filters */}
        {currentView === 'dashboard' && (
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-semibold">Providers</div>
            <ul className="space-y-3 px-2">
              {providers.map((provider) => {
                // Only show if configured
                if (!configuredServices[provider.id]) return null;

                return (
                  <li key={provider.id} className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.providers[provider.id] || false}
                        onChange={(e) => setFilter('providers', provider.id, e.target.checked)}
                        className="form-checkbox h-3 w-3 bg-transparent border-primary text-primary focus:ring-0"
                      />
                      <span className={`w-2 h-2 rounded-full ${provider.color}`}></span>
                      <span className="dark:text-slate-300">{provider.label}</span>
                    </label>
                    <span className="technical-font text-slate-500">{String(counts[provider.id] || 0).padStart(2, '0')}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Status Filters */}
        {currentView === 'dashboard' && (
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-4 px-2 font-semibold">Operation Status</div>
            <ul className="space-y-3 px-2">
              {statuses.map((status) => (
                <li key={status.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={filters.statuses[status.id] || false}
                    onChange={(e) => setFilter('statuses', status.id, e.target.checked)}
                    className="form-checkbox h-3 w-3 bg-transparent border-primary text-primary focus:ring-0"
                  />
                  <span className="dark:text-slate-300">{status.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Connection Status */}
      <div className="p-6 border-t border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-black/20">
        <div className="text-xs text-slate-400 mb-3 font-medium">Links</div>
        <div className="space-y-2">
          {providers.map(p => (
            <div key={p.id} className="flex justify-between items-center text-[10px]">
              <span className="text-slate-500 font-medium">{p.label.split(' ')[0]}</span>
              {getConnectionStatus(p.id)}
            </div>
          ))}
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500 font-medium">GitHub</span>
            {getConnectionStatus('github')}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
