import React from 'react';

const SIZE = {
  sm: 'w-full max-w-md',
  md: 'w-full max-w-2xl',
  lg: 'w-full max-w-4xl',
  xl: 'w-full max-w-6xl',
  wide: 'w-full sm:w-[92vw] lg:w-[80vw] max-w-screen-2xl',
};

/**
 * Modal shell (DESIGN.md §3.3/§5): dark scrim + a single elevated surface —
 * the only element in the app allowed an ambient shadow. The container owns
 * the neutral chrome (hairline border, bg-card, rounded-lg, shadow-xl);
 * children render their own internal layout only.
 */
export default function Modal({ open, onClose, children, className = '', size }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />
      <div
        className={`relative z-10 my-0 max-h-[min(92dvh,calc(100dvh-var(--safe-bottom)))] w-full overflow-y-auto rounded-t-lg border border-border-light bg-card-light shadow-xl sm:my-auto sm:max-h-[min(90vh,calc(100dvh-2rem))] sm:rounded-lg dark:border-border-dark dark:bg-card-dark ${SIZE[size] ?? ''} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
