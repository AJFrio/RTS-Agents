import React from 'react';
import Button from './Button.jsx';

/**
 * Empty state (DESIGN.md §4 stress contract): inline, typographic, neutral.
 * Caller-supplied `icon` stays a Material Symbol name during the icon-port
 * transition (DESIGN.md §9).
 */
export default function EmptyState({ icon = 'computer', title, subtitle, actionLabel = 'Open Settings', onAction }) {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 text-4xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
      {subtitle && (
        <p className="mt-1.5 text-[13px] text-neutral-500 dark:text-neutral-400 text-center max-w-md">
          {subtitle}
        </p>
      )}
      {onAction && (
        <Button variant="primary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
