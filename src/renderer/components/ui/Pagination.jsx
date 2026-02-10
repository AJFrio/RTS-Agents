import React from 'react';
import { formatCount } from '../../utils/format.js';

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
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-border-dark">
      <span className="technical-font text-xs text-slate-500">
        SHOWING {start}-{end} OF {total} TASKS
      </span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={currentPage <= 1}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          PREV
        </button>
        <span className="technical-font text-xs text-primary font-bold">PAGE {currentStr} / {totalStr}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-border-dark hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200 text-slate-600 dark:text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          NEXT
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </div>
  );
}
