import React, { useId, useState } from 'react';
import { IconChevronDown, IconChevronRight } from './icons.jsx';

/**
 * Collapsible (DESIGN.md §5): hairline neutral variants, borders-only.
 * Caller-supplied `icon` stays a Material Symbol name during the icon-port
 * transition (DESIGN.md §9).
 */
const VARIANTS = {
  solid: {
    root: 'rounded-md border border-border-light bg-card-light dark:border-border-dark dark:bg-card-dark',
    panel: 'border-t border-border-light dark:border-border-dark',
  },
  dashed: {
    root: 'rounded-md border border-dashed border-border-strong-light dark:border-border-strong-dark',
    panel: 'border-t border-border-light dark:border-border-dark',
  },
  plain: {
    root: 'rounded-md',
    panel: 'border-t border-border-light dark:border-border-dark',
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
  const Chevron = isOpen ? IconChevronDown : IconChevronRight;

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
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60 ${headerClassName}`}
      >
        <Chevron size={14} className="shrink-0 text-neutral-400" />
        {icon && (
          <span className="material-symbols-outlined text-[14px] text-neutral-400" aria-hidden="true">
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
