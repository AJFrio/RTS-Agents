import React from 'react';

export default function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
      <p className="mt-4 technical-font text-slate-400">{label}</p>
    </div>
  );
}
