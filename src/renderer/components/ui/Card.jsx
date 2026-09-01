import React from 'react';

/**
 * Cards (DESIGN.md §3.3): borders-only elevation — hairline border tokens,
 * no drop shadows. Hover = background/border tone shift.
 */
export function AgentCard({ children, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`flex h-full w-full flex-col justify-start text-left agent-card rounded-lg p-4 active:scale-[0.98] transition-colors duration-150 ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-lg transition-colors duration-150 ${className}`}
    >
      {children}
    </div>
  );
}
