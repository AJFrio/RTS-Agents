import React, { useId, useState } from 'react';
import { IconChevronDown, IconChevronRight } from './icons.jsx';

/**
 * Disclosure header (DESIGN.md §5): micro-label typography, hairline
 * neutrals, inline SVG chevron. Caller-supplied `icon` stays a Material
 * Symbol name during the icon-port transition (DESIGN.md §9).
 */
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
  const Chevron = isOpen ? IconChevronDown : IconChevronRight;

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
          className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <Chevron size={14} className="shrink-0 text-neutral-400" />
          {icon && (
            <span className="material-symbols-outlined text-[14px] text-neutral-400" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="min-w-0 truncate">{label}</span>
        </button>
        {headerAction && <span className="shrink-0">{headerAction}</span>}
        {typeof count === 'number' && (
          <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
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
