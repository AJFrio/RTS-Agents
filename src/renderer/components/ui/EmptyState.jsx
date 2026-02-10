import React from 'react';
import Button from './Button.jsx';

export default function EmptyState({ icon = 'computer', title, subtitle, actionLabel = 'Open Settings', onAction }) {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <span className="material-symbols-outlined text-slate-600 dark:text-slate-500 text-6xl">{icon}</span>
      <h3 className="mt-4 text-lg font-bold dark:text-white uppercase tracking-tight">{title}</h3>
      {subtitle && <p className="mt-2 text-slate-500 text-center max-w-md text-sm">{subtitle}</p>}
      {onAction && (
        <Button variant="primary" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
