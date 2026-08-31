import React from 'react';
import { formatCount } from '../../utils/format.js';
import { IconChevronRight } from './icons.jsx';

export default function Pagination({
  start,
  end,
  total,
  currentPage,
  totalPages,
  onPrev,
  onNext,
}) {
  if (totalPages <= 1) return null;
  const currentStr = formatCount(currentPage);
  const totalStr = formatCount(totalPages);
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-light dark:border-border-dark">
      <span className="technical-font text-[11px] text-neutral-500 dark:text-neutral-400">
        SHOWING {start}-{end} OF {total} TASKS
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentPage <= 1}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wider rounded-md border border-border-light dark:border-border-dark hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.98] transition-colors duration-150 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <IconChevronRight size={14} className="rotate-180" />
          PREV
        </button>
        <span className="technical-font text-[11px] text-neutral-900 dark:text-neutral-100 font-bold">
          PAGE {currentStr} / {totalStr}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wider rounded-md border border-border-light dark:border-border-dark hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.98] transition-colors duration-150 text-neutral-600 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          NEXT
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
