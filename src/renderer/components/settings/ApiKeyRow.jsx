import React from 'react';
import Button from '../ui/Button.jsx';

export default function ApiKeyRow({
  id,
  label,
  placeholder,
  hint,
  value,
  onChange,
  onSave,
  onTest,
  onDisconnect,
  configured = false,
  saving = false,
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">{label}</label>
      <div className="flex gap-2 inner-glow">
        <input
          id={id}
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={configured ? '••••••••••••••••' : placeholder}
          className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg text-sm py-2.5 px-4 text-slate-800 dark:text-white font-display placeholder:text-slate-500 transition-all duration-200"
        />
        {onSave && (
          <Button variant="primary" onClick={onSave} disabled={saving}>
            SAVE
          </Button>
        )}
        {onTest && (
          <Button variant="secondary" onClick={onTest} disabled={saving}>
            TEST
          </Button>
        )}
        {onDisconnect && configured && (
          <button
            type="button"
            onClick={onDisconnect}
            className="border border-red-900/50 text-red-400 px-4 py-2.5 text-[10px] technical-font font-bold hover:bg-red-900/20 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">link_off</span>
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] technical-font text-slate-500 opacity-60">{hint}</p>}
    </div>
  );
}
