import React from 'react';
import Button from '../ui/Button.jsx';
import { IconFolder, IconClose } from '../ui/icons.jsx';

/**
 * Path row (DESIGN.md §3.2): paths are technical strings — mono type in
 * inset wells, hairline borders, neutral controls.
 */
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
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-[12px]"
        />
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="rounded-md border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 px-3 flex items-center justify-center transition-colors duration-150"
            title="Browse Folder"
            aria-label="Browse Folder"
          >
            <IconFolder size={15} />
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md bg-neutral-900 text-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-neutral-700 active:scale-[0.98] transition-colors duration-150 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            ADD
          </button>
        )}
      </div>
      {paths.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {paths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between px-3 py-2 bg-inset-light dark:bg-inset-dark border border-border-light dark:border-border-dark rounded-md"
            >
              <span className="text-[12px] text-neutral-700 dark:text-neutral-300 font-mono truncate">
                {path}
              </span>
              <button
                type="button"
                onClick={() => onRemove?.(path)}
                aria-label={`Remove ${path}`}
                className="text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
              >
                <IconClose size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
