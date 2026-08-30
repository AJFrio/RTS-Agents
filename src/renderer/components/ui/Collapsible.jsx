import React, { useId, useState } from 'react';

const VARIANTS = {
  solid: {
    root: 'rounded-md border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50',
    panel: 'border-t border-slate-200 dark:border-slate-700',
  },
  dashed: {
    root: 'rounded-md border border-dashed border-slate-300 dark:border-slate-700',
    panel: 'border-t border-slate-200 dark:border-slate-700',
  },
  plain: {
    root: 'rounded-md',
    panel: 'border-t border-slate-100 dark:border-slate-800',
  },
};

export default function Collapsible({
  open,
  defaultOpen = false,
  onToggle,
  label,
  icon,
  meta,
  variant = 'solid',
  mountWhenClosed = true,
  className = '',
  headerClassName = '',
  panelClassName = '',
  children,
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internalOpen;
  const id = useId();
  const headerId = `collapsible-${id}-header`;
  const panelId = `collapsible-${id}-panel`;
  const styles = VARIANTS[variant] ?? VARIANTS.solid;

  const toggle = (next) => {
    if (open === undefined) setInternalOpen(next);
    if (onToggle) onToggle(next);
  };

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight' && !isOpen) {
      e.preventDefault();
      toggle(true);
    } else if (e.key === 'ArrowLeft' && isOpen) {
      e.preventDefault();
      toggle(false);
    }
  };

  return (
    <div className={`${styles.root} ${className}`}>
      <button
        type="button"
        id={headerId}
        aria-expanded={isOpen}
        aria-controls={mountWhenClosed || isOpen ? panelId : undefined}
        onClick={() => toggle(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70 ${headerClassName}`}
      >
        <span className="material-symbols-outlined text-[14px] text-slate-400" aria-hidden="true">
          {isOpen ? 'expand_more' : 'chevron_right'}
        </span>
        {icon && (
          <span className="material-symbols-outlined text-[14px] text-slate-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta && <span className="shrink-0">{meta}</span>}
      </button>
      {(mountWhenClosed || isOpen) && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className={`${isOpen ? '' : 'hidden'} ${styles.panel} px-2.5 py-2 ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
