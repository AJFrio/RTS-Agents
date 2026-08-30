import React from 'react';

const SIZE = {
  sm: 'w-full max-w-md',
  md: 'w-full max-w-2xl',
  lg: 'w-full max-w-4xl',
  xl: 'w-full max-w-6xl',
  wide: 'w-full sm:w-[92vw] lg:w-[80vw] max-w-screen-2xl',
};

export default function Modal({ open, onClose, children, className = '', size }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />
      <div className={`relative z-10 ${SIZE[size] ?? ''} ${className}`}>{children}</div>
    </div>
  );
}
