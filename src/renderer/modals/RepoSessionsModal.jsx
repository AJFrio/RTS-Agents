import React, { useMemo, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import { providerMeta } from '../components/ui/icons.jsx';
import { StatusDot, statusMeta } from '../components/ui/status.jsx';

function formatWhen(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * "See all sessions" modal for one repo or harness section in the sidebar
 * (DESIGN.md §6): full session list with search, status filter, and click
 * to open the task transcript on the canvas.
 */
export default function RepoSessionsModal({ open, title, tasks, onClose }) {
  const { openTask } = useApp();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tasks || [])
      .filter((task) => (status === 'all' ? true : task.status === status))
      .filter((task) => {
        if (!q) return true;
        return [task.name, task.prompt, task.repository, task.summary]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [tasks, search, status]);

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div
        id="repo-sessions-modal"
        className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-lg border border-border-light bg-card-light shadow-xl dark:border-border-dark dark:bg-card-dark"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
              {title || 'Sessions'}
            </h2>
            <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
              {tasks?.length ?? 0} saved session{(tasks?.length ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sessions"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-border-light px-4 py-2 dark:border-border-dark">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            className="w-full text-[13px]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="w-auto shrink-0 text-[12px]"
          >
            <option value="all">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
              No sessions match.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((task) => {
                const meta = providerMeta(task.provider);
                const statusInfo = statusMeta(task.status);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.();
                        openTask(task);
                      }}
                      className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      <div className="flex items-center gap-2">
                        <meta.Icon size={13} className="shrink-0 text-neutral-400" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-800 dark:text-neutral-200">
                          {task.name || 'Task'}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.bg} ${statusInfo.text}`}
                        >
                          <StatusDot status={task.status} />
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate pl-[21px] text-[11px] text-neutral-400 dark:text-neutral-500">
                        {meta.label} · {formatWhen(task.updatedAt || task.createdAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
