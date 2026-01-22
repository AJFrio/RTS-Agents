/**
 * Dashboard Component
 * 
 * Main dashboard view showing agent cards
 */

import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import AgentCard from './AgentCard';
import type { Provider } from '../store/types';

export default function Dashboard() {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    dispatch({
      type: 'SET_FILTERS',
      payload: { search: value },
    });
  };

  const handleProviderFilter = (provider: string) => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        providers: {
          ...state.filters.providers,
          [provider]: !state.filters.providers[provider],
        },
      },
    });
  };

  const { loadAgentDetails } = useApp();
  
  const handleAgentClick = (_agentId: string, provider: Provider, rawId: string) => {
    dispatch({ type: 'SET_SHOW_AGENT_MODAL', payload: true });
    // Load agent details in context
    loadAgentDetails(provider, rawId);
  };

  const providerFilters = [
    { id: 'jules', label: 'Jules', color: 'bg-primary', count: state.counts.jules },
    { id: 'cursor', label: 'Cursor', color: 'bg-blue-500', count: state.counts.cursor },
    { id: 'codex', label: 'Codex', color: 'bg-cyan-500', count: state.counts.codex },
    { id: 'claude-cloud', label: 'Claude', color: 'bg-amber-500', count: state.counts['claude-cloud'] },
  ];

  // Show loading state
  if (state.loading && state.agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 text-sm text-slate-500">Loading agents...</p>
      </div>
    );
  }

  // Show empty state
  const hasAnyConfigured = Object.values(state.configuredServices).some(v => v);
  if (!hasAnyConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">computer</span>
        <h3 className="mt-4 text-lg font-semibold">No Agents Configured</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          Configure API keys in Settings to connect with Jules, Cursor, Codex, or Claude Cloud.
        </p>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
          className="mt-4 bg-primary text-black px-6 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          Open Settings
        </button>
      </div>
    );
  }

  if (state.filteredAgents.length === 0 && state.agents.length > 0) {
    return (
      <div className="p-4">
        {/* Search and Filters */}
        <div className="mb-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-sm">search</span>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search tasks..."
              className="w-full bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark text-sm py-2.5 pl-10 pr-4 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 shadow-sm"
            />
          </div>

          {/* Provider Filters */}
          <div className="flex flex-wrap gap-2">
            {providerFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => handleProviderFilter(filter.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all duration-200 ${
                  state.filters.providers[filter.id]
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-slate-300 dark:border-border-dark text-slate-500 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${filter.color}`} />
                {filter.label}
                <span className="text-slate-400">({filter.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* No results */}
        <div className="flex flex-col items-center justify-center h-48">
          <span className="material-symbols-outlined text-slate-500 text-4xl">filter_alt_off</span>
          <p className="mt-2 text-slate-500 text-sm">No tasks match your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Search and Filters */}
      <div className="mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
            <span className="material-symbols-outlined text-sm">search</span>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search tasks..."
            className="w-full bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark text-sm py-2.5 pl-10 pr-4 font-display text-xs placeholder:text-slate-500 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Provider Filters */}
        <div className="flex flex-wrap gap-2">
          {providerFilters.map(filter => (
            <button
              key={filter.id}
              onClick={() => handleProviderFilter(filter.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-display font-bold uppercase tracking-wider border transition-colors ${
                state.filters.providers[filter.id]
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-300 dark:border-border-dark text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${filter.color}`} />
              {filter.label}
              <span className="text-slate-400">({filter.count})</span>
            </button>
          ))}
        </div>
      </div>

        {/* Error Banner */}
        {state.errors.length > 0 && (
          <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-xl shadow-sm">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400 text-sm">error</span>
              <div>
                <h4 className="text-xs font-semibold text-red-300">Errors</h4>
                <ul className="mt-1 text-xs text-red-400">
                  {state.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

      {/* Agent Cards */}
      <div className="space-y-3">
        {state.filteredAgents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onClick={() => handleAgentClick(agent.id, agent.provider, agent.rawId)}
          />
        ))}
      </div>

      {/* Loading indicator for refresh */}
      {state.loading && state.agents.length > 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-card-dark border border-border-dark px-4 py-2 rounded-lg shadow-lg z-50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm animate-spin">sync</span>
            <span className="text-xs text-slate-400">Refreshing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
