import React from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { providerMeta } from '../ui/icons.jsx';
import { StatusDot, canvasStatusMeta } from '../ui/status.jsx';
import { relativeTime, shortRepo, truncate } from './card-meta.js';

function MetaDot() {
  return (
    <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
      ·
    </span>
  );
}

/**
 * Chat task card: the overview Janus surfaces for a task
 * (DESIGN.md §5). Clicking opens the task transcript on the canvas.
 */
export default function TaskCard({ task, compact = false, onClick }) {
  const { openTask } = useApp();
  const meta = providerMeta(task?.provider);
  const Icon = meta.Icon;
  const status = canvasStatusMeta(task?.status);
  const statusKey = String(task?.status || '').toLowerCase();
  const running = statusKey === 'running';
  const completed = statusKey === 'completed';
  const repo = shortRepo(task?.repository);
  const preview = truncate(task?.summary || task?.prompt, 140);
  const titleClass = running
    ? 'text-emerald-800 dark:text-emerald-400'
    : completed
      ? 'text-neutral-500 dark:text-neutral-400'
      : 'text-neutral-900 dark:text-neutral-100';

  const handleClick = () => {
    if (onClick) {
      onClick(task);
      return;
    }
    openTask(task);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-2 rounded-md border border-border-light bg-card-light px-2.5 py-2 text-left transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark"
      >
        <Icon size={14} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className={`min-w-0 flex-1 truncate text-[13px] ${titleClass}`}>
          {task?.name || 'Task'}
        </span>
        <StatusDot status={task?.status} variant="canvas" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-lg border border-border-light bg-card-light p-3 text-left transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-inset-light text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
          <Icon size={13} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${titleClass}`}>
          {task?.name || 'Task'}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}
        >
          <StatusDot status={task?.status} variant="canvas" />
          {status.label}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="shrink-0">{meta.label}</span>
        {repo && (
          <>
            <MetaDot />
            <span className="min-w-0 truncate font-mono">{repo}</span>
          </>
        )}
        {task?.branch && (
          <>
            <MetaDot />
            <span className="min-w-0 truncate font-mono">{task.branch}</span>
          </>
        )}
        {(task?.updatedAt || task?.createdAt) && (
          <>
            <MetaDot />
            <span className="shrink-0">{relativeTime(task.updatedAt || task.createdAt)}</span>
          </>
        )}
      </div>
      {preview && (
        <p className="mt-1.5 pl-8 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {preview}
        </p>
      )}
    </button>
  );
}
