import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext.jsx';

export default function ModelSelector({ value, onChange }) {
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
    setLoading(true);
    api.orchestratorGetModels()
      .then(result => {
        if (mounted && result && result.models) {
          setModels(result.models);
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

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
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
          className="flex-1 bg-transparent border-none text-sm py-2.5 px-4 text-slate-800 dark:text-white focus:ring-0 placeholder:text-slate-500 w-full"
        />
        <div className="flex items-center pr-2">
            {loading ? (
                <span className="material-symbols-outlined text-slate-400 animate-spin text-lg">sync</span>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (isOpen) setSearch('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">
                        {isOpen ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
            )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark rounded-lg shadow-xl" ref={listRef}>
          {Object.keys(groupedModels).length === 0 ? (
             <div className="px-4 py-3 text-sm text-slate-500 italic">
               {search.trim() ? `Press Enter to use "${search}"` : 'No models found'}
             </div>
          ) : (
            Object.entries(groupedModels).map(([provider, items]) => (
                <div key={provider}>
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
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
                                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between group ${
                                    isHighlighted
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                                } ${isSelected ? 'font-medium text-primary' : ''}`}
                            >
                                <span className="truncate mr-2">{model.name}</span>
                                {isSelected && <span className="material-symbols-outlined text-lg">check</span>}
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
