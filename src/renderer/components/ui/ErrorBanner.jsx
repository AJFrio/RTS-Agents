import React from 'react';
import { IconAlert } from './icons.jsx';

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Error banner (DESIGN.md §3.1): red is reserved for failure semantics —
 * muted red tint + hairline, no shadow.
 */
export default function ErrorBanner({ errors }) {
  if (!errors?.length) return null;
  return (
    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
      <div className="flex items-start gap-2.5">
        <IconAlert size={15} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
            Errors Detected
          </h4>
          <ul className="mt-1 text-[12px] text-red-600 dark:text-red-400 list-disc list-inside">
            {errors.map((e, i) => (
              <li key={i}>
                {(e.provider || '').toUpperCase()}: {escapeHtml(e.error)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
