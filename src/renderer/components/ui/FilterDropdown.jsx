import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { formatCount } from '../../utils/format.js';

const PROVIDERS = [
  { id: 'antigravity', label: 'ANTIGRAVITY CLI' },
  { id: 'jules', label: 'JULES' },
  { id: 'cursor', label: 'CURSOR' },
  { id: 'codex', label: 'CODEX' },
  { id: 'claude-cli', label: 'CLAUDE CLI' },
  { id: 'claude-cloud', label: 'CLAUDE CLOUD' },
  { id: 'opencode', label: 'OPENCODE' },
];

const STATUS_FILTERS = [
  { id: 'running', label: 'RUNNING' },
  { id: 'completed', label: 'Completed' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'FAILED/STOPPED', muted: true },
];

/**
 * Filter popover (DESIGN.md §3.3): borders-only elevation — hairline border,
 * bg-card, no shadow. Provider identity is typography, not brand color.
 */
export default function FilterDropdown() {
  const { state, dispatch, api } = useApp();
  const { filters, counts, configuredServices } = state;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const activeFilterCount =
    Object.values(filters.providers || {}).filter((enabled) => !enabled).length +
    Object.values(filters.statuses || {}).filter((enabled) => !enabled).length;

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
        className={`flex min-h-8 items-center gap-2 px-3 py-1.5 text-[12px] font-medium rounded-md border border-border-light dark:border-border-dark hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.98] transition-colors duration-150 text-neutral-600 dark:text-neutral-300 ${
          isOpen ? 'bg-neutral-100 dark:bg-neutral-800' : ''
        }`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : 'Filters'}
      >
        <span className="material-symbols-outlined text-sm">filter_list</span>
        <span className="sm:hidden">{activeFilterCount > 0 ? `(${activeFilterCount})` : 'Filter'}</span>
        <span className="hidden sm:inline">
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(16rem,calc(100vw-1.5rem))] bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg z-50 p-4 space-y-4">
          <div>
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-2.5 px-1 font-semibold uppercase tracking-wider">
              Providers
            </div>
            <ul className="space-y-1">
              {PROVIDERS.map(({ id, label }) => {
                if (!configuredServices[id]) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between text-[12px] px-1 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded py-1 transition-colors"
                  >
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input
                        type="checkbox"
                        checked={filters.providers[id] ?? true}
                        className="h-3.5 w-3.5"
                        onChange={(e) => handleFilterChange('providers', id, e.target.checked)}
                      />
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium">
                        {label}
                      </span>
                    </label>
                    <span className="technical-font text-neutral-400 dark:text-neutral-500 text-[10px]">
                      {formatCount(counts[id] ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-border-light dark:border-border-dark pt-3">
            <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-2.5 px-1 font-semibold uppercase tracking-wider">
              Status
            </div>
            <ul className="space-y-1">
              {STATUS_FILTERS.map(({ id, label, muted }) => (
                <li
                  key={id}
                  className="flex items-center gap-2 text-[12px] px-1 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 rounded py-1 transition-colors"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none w-full">
                    <input
                      type="checkbox"
                      checked={filters.statuses[id] ?? true}
                      className="h-3.5 w-3.5"
                      onChange={(e) => handleFilterChange('statuses', id, e.target.checked)}
                    />
                    <span
                      className={`font-medium ${muted ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-700 dark:text-neutral-300'}`}
                    >
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
