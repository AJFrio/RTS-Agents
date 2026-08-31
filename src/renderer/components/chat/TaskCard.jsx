import React from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { providerMeta } from '../ui/icons.jsx';
import { StatusDot, statusMeta } from '../ui/status.jsx';

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function shortRepo(repository) {
  if (!repository) return null;
  const text = String(repository);
  const base = text.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return base || text;
}

/**
 * Chat task card: the overview the orchestrator surfaces for a task
 * (DESIGN.md §5). Clicking opens the task transcript on the canvas.
 */
export default function TaskCard({ task, compact = false, onClick }) {
  const { openTask } = useApp();
  const meta = providerMeta(task?.provider);
  const Icon = meta.Icon;
  const status = statusMeta(task?.status);
  const repo = shortRepo(task?.repository);

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
        className="flex w-full items-center gap-2 rounded-md border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark px-2.5 py-2 text-left transition-colors hover:border-border-strong-light dark:hover:border-border-strong-dark"
      >
        <Icon size={14} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-800 dark:text-neutral-200">
          {task?.name || 'Task'}
        </span>
        <StatusDot status={task?.status} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-lg border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark p-3 text-left transition-colors hover:border-border-strong-light dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-inset-light dark:bg-inset-dark text-neutral-600 dark:text-neutral-300">
          <Icon size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
          {task?.name || 'Task'}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}
        >
          <StatusDot status={task?.status} />
          {status.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-8 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="shrink-0">{meta.label}</span>
        {repo && (
          <>
            <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
              ·
            </span>
            <span className="min-w-0 truncate font-mono">{repo}</span>
          </>
        )}
        {task?.updatedAt && (
          <>
            <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
              ·
            </span>
            <span className="shrink-0">{relativeTime(task.updatedAt)}</span>
          </>
        )}
      </div>
    </button>
  );
}
