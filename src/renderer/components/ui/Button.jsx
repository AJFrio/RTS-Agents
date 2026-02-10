import React from 'react';

const variants = {
  primary:
    'bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] transition-all duration-200',
  secondary:
    'border border-slate-300 dark:border-border-dark text-slate-600 dark:text-slate-400 px-4 py-2 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all duration-200',
  danger:
    'border border-red-500/50 text-red-400 px-4 py-2 text-xs font-semibold rounded-lg hover:bg-red-500/10 active:scale-[0.98] transition-all duration-200',
  ghost: 'text-slate-400 hover:text-white px-2 py-1 transition-colors',
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
