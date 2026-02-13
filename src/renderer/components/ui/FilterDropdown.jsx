import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { formatCount } from '../../utils/format.js';

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
  { id: 'completed', label: 'Completed' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'FAILED/STOPPED', muted: true },
];

export default function FilterDropdown() {
  const { state, dispatch, api } = useApp();
  const { filters, counts, configuredServices } = state;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 ${
          isOpen ? 'bg-slate-200 dark:bg-slate-800' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="material-symbols-outlined text-sm">filter_list</span>
        Filters
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-xl z-50 p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-3 px-1 font-semibold uppercase tracking-wider">
              Providers
            </div>
            <ul className="space-y-2">
              {PROVIDERS.map(({ id, label, dot }) => {
                if (!configuredServices[id]) return null;
                return (
                  <li key={id} className="flex items-center justify-between text-xs px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded py-1 transition-colors">
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input
                        type="checkbox"
                        checked={filters.providers[id] ?? true}
                        className="form-checkbox h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/20 transition-all"
                        onChange={(e) => handleFilterChange('providers', id, e.target.checked)}
                      />
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{label}</span>
                    </label>
                    <span className="technical-font text-slate-400 dark:text-slate-500 text-[10px]">
                      {formatCount(counts[id] ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-slate-100 dark:border-border-dark pt-4">
            <div className="text-xs text-slate-400 dark:text-slate-500 mb-3 px-1 font-semibold uppercase tracking-wider">
              Status
            </div>
            <ul className="space-y-2">
              {STATUS_FILTERS.map(({ id, label, muted }) => (
                <li key={id} className="flex items-center gap-2 text-xs px-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded py-1 transition-colors">
                  <label className="flex items-center gap-2 cursor-pointer select-none w-full">
                    <input
                      type="checkbox"
                      checked={filters.statuses[id] ?? true}
                      className="form-checkbox h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/20 transition-all"
                      onChange={(e) => handleFilterChange('statuses', id, e.target.checked)}
                    />
                    <span className={`font-medium ${muted ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
