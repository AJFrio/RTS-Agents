import React from 'react';

/**
 * Button variants (DESIGN.md §3.1): accent is inverted-neutral — near-black
 * fill with white text in light theme, flipped in dark. Compact paddings,
 * hairline borders, no shadows.
 */
const variants = {
  primary:
    'bg-neutral-900 text-white px-3 py-1.5 text-[12px] font-medium rounded-md hover:bg-neutral-700 active:scale-[0.98] transition-colors duration-150 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300',
  secondary:
    'border border-border-light dark:border-border-dark text-neutral-600 dark:text-neutral-300 px-3 py-1.5 text-[12px] font-medium rounded-md hover:bg-neutral-100 hover:border-border-strong-light dark:hover:bg-neutral-800 dark:hover:border-border-strong-dark active:scale-[0.98] transition-colors duration-150',
  danger:
    'border border-red-500/40 text-red-600 dark:text-red-400 px-3 py-1.5 text-[12px] font-medium rounded-md hover:bg-red-500/10 active:scale-[0.98] transition-colors duration-150',
  ghost:
    'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 px-2 py-1 text-[12px] font-medium rounded-md transition-colors duration-150',
};

export default function Button({
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`${variants[variant] || variants.primary} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
