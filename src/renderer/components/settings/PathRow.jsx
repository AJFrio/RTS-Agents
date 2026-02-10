import React from 'react';
import Button from '../ui/Button.jsx';

export default function PathRow({
  label,
  placeholder,
  value,
  onChange,
  onAdd,
  onBrowse,
  paths = [],
  onRemove,
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg text-sm py-2.5 px-4 text-slate-800 dark:text-white font-display placeholder:text-slate-500 transition-all duration-200"
        />
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="bg-[#2A2A2A] hover:bg-[#3A3A3A] border border-border-dark text-slate-300 px-4 py-2.5 flex items-center justify-center transition-all rounded-lg"
            title="Browse Folder"
          >
            <span className="material-symbols-outlined text-sm">folder_open</span>
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="bg-emerald-600 text-white px-6 py-2.5 text-[10px] technical-font font-bold hover:brightness-110 rounded-lg"
          >
            ADD
          </button>
        )}
      </div>
      {paths.length > 0 && (
        <div className="space-y-2 mt-2">
          {paths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between p-3 bg-slate-700/20 dark:bg-slate-800/20 border border-border-dark rounded-lg"
            >
              <span className="text-sm text-slate-300 font-mono truncate">{path}</span>
              <button
                type="button"
                onClick={() => onRemove?.(path)}
                className="text-slate-400 hover:text-red-400 transition-colors p-1"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
