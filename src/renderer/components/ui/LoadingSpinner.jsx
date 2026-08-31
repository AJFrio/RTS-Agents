import React from 'react';
import { IconSync } from './icons.jsx';

export default function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center h-64">
      <IconSync size={20} className="animate-spin text-neutral-500 dark:text-neutral-400" />
      <p className="mt-3 technical-font text-neutral-400 dark:text-neutral-500">{label}</p>
    </div>
  );
}
