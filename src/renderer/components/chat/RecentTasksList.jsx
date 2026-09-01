import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { providerMeta } from '../ui/icons.jsx';
import { StatusDot, canvasStatusMeta } from '../ui/status.jsx';
import { getProviderDisplayName } from '../../utils/format.js';

const RECENT_TASK_LIMIT = 20;

function shortRepo(repository) {
  if (!repository) return null;
  const text = String(repository);
  const base = text.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return base || text;
}

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

function RecentTaskRow({ task, onOpen }) {
  const meta = providerMeta(task?.provider);
  const status = canvasStatusMeta(task?.status);
  const repo = shortRepo(task?.repository);
  const harness = getProviderDisplayName(task?.provider) || meta.label;
  const when = relativeTime(task?.updatedAt || task?.createdAt);
  const statusKey = String(task?.status || '').toLowerCase();
  const running = statusKey === 'running';
  const completed = statusKey === 'completed';

  return (
    <button
      type="button"
      className={`agent-recent-task flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60 ${
        running ? 'bg-emerald-500/5 dark:bg-emerald-500/5' : ''
      }`}
      data-task-id={task?.id || task?.rawId || undefined}
      onClick={() => onOpen(task)}
    >
      <StatusDot status={task?.status} variant="canvas" className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
              running
                ? 'text-emerald-800 dark:text-emerald-400'
                : completed
                  ? 'text-neutral-500 dark:text-neutral-400'
                  : 'text-neutral-900 dark:text-neutral-100'
            }`}
          >
            {task?.name || 'Task'}
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
          {when && (
            <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
              {when}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span className="shrink-0">{harness}</span>
          {repo && (
            <>
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
                ·
              </span>
              <span className="min-w-0 truncate font-mono">{repo}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Recent-task list for the Agent landing. Sorts by updatedAt/createdAt,
 * caps at 20, and opens task-detail via openTask. The Agent page animates
 * this closed when a message is sent.
 */
export default function RecentTasksList() {
  const { state, openTask } = useApp();

  const recent = useMemo(() => {
    return [...(state.agents || [])]
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, RECENT_TASK_LIMIT);
  }, [state.agents]);

  return (
    <section
      id="agent-recent-tasks"
      className="flex h-full flex-col overflow-hidden border-t border-border-light dark:border-border-dark"
      aria-labelledby="agent-recent-tasks-title"
    >
      <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center px-4 py-2">
        <h3
          id="agent-recent-tasks-title"
          className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
        >
          Recent tasks
        </h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {recent.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-neutral-400 dark:text-neutral-500">
            No recent tasks yet.
          </p>
        ) : (
          <ul className="mx-auto w-full max-w-3xl space-y-0.5">
            {recent.map((task) => (
              <li key={`${task.provider}-${task.rawId || task.id}`}>
                <RecentTaskRow task={task} onOpen={openTask} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
