import React, { useId, useState } from 'react';

export default function SectionHeader({
  open,
  defaultOpen = false,
  onToggle,
  label,
  icon,
  count,
  headerAction,
  mountWhenClosed = true,
  panelClassName = '',
  children,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internalOpen;
  const id = useId();
  const headerId = `section-${id}-header`;
  const panelId = `section-${id}-panel`;

  const toggle = (next) => {
    if (open === undefined) setInternalOpen(next);
    if (onToggle) onToggle(next);
  };

  return (
    <section>
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          id={headerId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => toggle(!isOpen)}
          className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <span className="material-symbols-outlined text-[14px] text-slate-400" aria-hidden="true">
            {isOpen ? 'expand_more' : 'chevron_right'}
          </span>
          {icon && (
            <span className="material-symbols-outlined text-[14px] text-slate-400" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="min-w-0 truncate">{label}</span>
        </button>
        {headerAction && <span className="shrink-0">{headerAction}</span>}
        {typeof count === 'number' && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {count}
          </span>
        )}
      </div>
      {(mountWhenClosed || isOpen) && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className={`${isOpen ? '' : 'hidden'} mt-2 ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </section>
  );
}
