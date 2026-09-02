import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { IconSync, IconChevronDown, IconCheck } from '../ui/icons.jsx';

function normalizeModel(model) {
  if (!model) return null;

  if (typeof model === 'string') {
    const provider = model.includes('/') ? model.split('/')[0] : 'other';
    return { id: model, name: model, provider };
  }

  if (typeof model.id !== 'string' || !model.id.trim()) {
    return null;
  }

  const provider = typeof model.provider === 'string' && model.provider.trim()
    ? model.provider
    : model.id.includes('/') ? model.id.split('/')[0] : 'other';

  return {
    ...model,
    id: model.id,
    name: typeof model.name === 'string' && model.name.trim() ? model.name : model.id,
    provider,
  };
}

function normalizeModels(result) {
  if (!Array.isArray(result?.models)) return [];
  return result.models.map(normalizeModel).filter(Boolean);
}

function shortModelLabel(idOrName) {
  if (!idOrName) return 'Model';
  const text = String(idOrName);
  const parts = text.split('/');
  return parts[parts.length - 1] || text;
}

export default function ModelSelector({ value, onChange, variant = 'default' }) {
  const { api } = useApp();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch models on mount
  useEffect(() => {
    let mounted = true;

    if (!api?.orchestratorGetModels) {
      setModels([]);
      setLoading(false);
      return () => { mounted = false; };
    }

    setLoading(true);
    api.orchestratorGetModels()
      .then(result => {
        if (mounted) {
          setModels(normalizeModels(result));
        }
      })
      .catch(err => console.error("Failed to load models", err))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [api]);

  const selectedDisplay = useMemo(() => {
      const m = models.find(x => x.id === value);
      return m ? m.name : value;
  }, [value, models]);

  // Filter models
  const filteredModels = useMemo(() => {
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  }, [models, search]);

  // Group by provider
  const groupedModels = useMemo(() => {
    const groups = {};
    filteredModels.forEach(m => {
      const p = m.provider || 'other';
      if (!groups[p]) groups[p] = [];
      groups[p].push(m);
    });
    return groups;
  }, [filteredModels]);

  const flatList = useMemo(() => {
    return Object.entries(groupedModels).flatMap(([provider, items]) => items);
  }, [groupedModels]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearch(''); // Reset search on close
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }

    if (flatList.length === 0) {
        if (e.key === 'Enter' && search.trim()) {
            e.preventDefault();
            // Allow custom value
            onChange(search);
            setSearch('');
            setIsOpen(false);
        }
        return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % flatList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev <= 0 ? flatList.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatList.length) {
        selectModel(flatList[highlightedIndex]);
      } else if (search.trim()) {
          // If no highlight, allow text value
          onChange(search);
          setSearch('');
          setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearch('');
    }
  };

  const selectModel = (model) => {
    onChange(model.id);
    setSearch('');
    setIsOpen(false);
  };

  // Scroll highlighted into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
        const item = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
        if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const isInline = variant === 'inline';

  return (
    <div className={`relative ${isInline ? '' : 'w-full'}`} ref={containerRef}>
      {isInline ? (
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (isOpen) setSearch('');
          }}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label="Select Janus model"
          className="inline-flex max-w-[200px] items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <span className="min-w-0 truncate">
            {loading ? 'Loading…' : shortModelLabel(selectedDisplay)}
          </span>
          {loading ? (
            <IconSync size={12} className="shrink-0 animate-spin" />
          ) : (
            <IconChevronDown size={12} className={`shrink-0 opacity-70 ${isOpen ? 'rotate-180' : ''}`} />
          )}
        </button>
      ) : (
        <div className="flex items-center bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-md focus-within:border-border-strong-light dark:focus-within:border-border-strong-dark transition-colors duration-150">
          <input
            type="text"
            value={isOpen ? search : (selectedDisplay || '')}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? "Loading models..." : "Select or type model..."}
            className="flex-1 bg-transparent border-none text-[13px] py-2 px-3 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 w-full"
          />
          <div className="flex items-center pr-1.5">
              {loading ? (
                  <IconSync size={15} className="animate-spin text-neutral-400" />
              ) : (
                  <button
                      type="button"
                      onClick={() => {
                          setIsOpen(!isOpen);
                          if (isOpen) setSearch('');
                      }}
                      aria-label={isOpen ? 'Collapse model list' : 'Expand model list'}
                      className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  >
                      <IconChevronDown size={15} className={isOpen ? 'rotate-180' : ''} />
                  </button>
              )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className={`absolute z-50 overflow-y-auto bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-md ${
            isInline
              ? 'bottom-full left-0 mb-1 max-h-60 w-72 max-w-[calc(100vw-2rem)]'
              : 'left-0 right-0 mt-1 max-h-60'
          }`}
          ref={listRef}
        >
          {isInline && (
            <div className="sticky top-0 border-b border-border-light bg-card-light px-2 py-1.5 dark:border-border-dark dark:bg-card-dark">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search models"
                aria-label="Search models"
                className="w-full border-0 bg-transparent px-1 text-[12px] focus:ring-0"
              />
            </div>
          )}
          {Object.keys(groupedModels).length === 0 ? (
             <div className="px-3 py-2.5 text-[13px] text-neutral-500 dark:text-neutral-400">
               {search.trim() ? `Press Enter to use "${search}"` : 'No models found'}
             </div>
          ) : (
            Object.entries(groupedModels).map(([provider, items]) => (
                <div key={provider}>
                    <div className="px-3 py-1.5 bg-inset-light dark:bg-inset-dark text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider sticky top-0">
                        {provider}
                    </div>
                    {items.map((model) => {
                        const index = flatList.indexOf(model);
                        const isSelected = model.id === value;
                        const isHighlighted = index === highlightedIndex;

                        return (
                            <button
                                key={model.id}
                                type="button"
                                data-index={index}
                                onClick={() => selectModel(model)}
                                className={`w-full text-left px-3 py-2 text-[13px] transition-colors flex items-center justify-between group ${
                                    isHighlighted
                                        ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
                                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
                                } ${isSelected ? 'font-medium' : ''}`}
                            >
                                <span className="truncate mr-2">{model.name}</span>
                                {isSelected && <IconCheck size={14} className="shrink-0 text-neutral-700 dark:text-neutral-300" />}
                            </button>
                        );
                    })}
                </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
