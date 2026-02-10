import React from 'react';

export function AgentCard({ children, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`w-full text-left agent-card rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] p-4 transition-all duration-200 ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm transition-all duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
