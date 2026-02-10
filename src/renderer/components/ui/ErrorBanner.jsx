import React from 'react';

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export default function ErrorBanner({ errors }) {
  if (!errors?.length) return null;
  return (
    <div className="mb-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-red-400 mt-0.5">error</span>
        <div>
          <h4 className="text-sm font-bold text-red-300 uppercase">Errors Detected</h4>
          <ul className="mt-1 text-sm text-red-400 list-disc list-inside">
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
