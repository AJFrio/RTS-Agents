import React, { useMemo, useState } from 'react';
import { useAppActions, useAppState } from '../../context/AppContext.jsx';
import { providerMeta } from '../ui/icons.jsx';
import { StatusDot } from '../ui/status.jsx';
import RepoSessionsModal from '../../modals/RepoSessionsModal.jsx';

function shortRepo(repository) {
  const text = String(repository || '').trim();
  if (!text) return null;
  const base = text.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return base || text;
}

function relativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function sectionKey(agent) {
  return shortRepo(agent.repository) || 'No repository';
}

function sortTasks(tasks) {
  const rank = (task) => (task.status === 'running' ? 0 : 1);
  return [...tasks].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function TaskRow({ task }) {
  const { openTask } = useAppActions();
  const running = String(task.status).toLowerCase() === 'running';
  return (
    <button
      type="button"
      onClick={() => openTask(task)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/60 ${
        running ? 'bg-emerald-500/5 dark:bg-emerald-500/5' : ''
      }`}
    >
      <StatusDot status={task.status} />
      <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">
        {task.name || 'Task'}
      </span>
      <span className="shrink-0 text-[10px] text-neutral-400">
        {relativeTime(task.updatedAt || task.createdAt)}
      </span>
    </button>
  );
}

function Section({ id, icon, label, tasks, defaultOpen = false, onSeeAll }) {
  const [open, setOpen] = useState(defaultOpen);
  const running = tasks.filter(
    (task) => String(task.status).toLowerCase() === 'running'
  );
  const rest = tasks.filter(
    (task) => String(task.status).toLowerCase() !== 'running'
  );
  const shown = rest.slice(0, 10);

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`section-panel-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
      >
        <span
          aria-hidden="true"
          className={`text-neutral-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {running.length > 0 && (
          <span className="shrink-0 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            {running.length} active
          </span>
        )}
        <span className="shrink-0 rounded-full bg-neutral-200/70 px-1.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {tasks.length}
        </span>
      </button>

      {running.length > 0 && (
        <div className="mt-0.5 space-y-0.5 pl-3">
          {running.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      <div
        id={`section-panel-${id}`}
        className={`${open ? '' : 'hidden'} mt-0.5 space-y-0.5 pl-3`}
      >
        {shown.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        {rest.length > shown.length && (
          <button
            type="button"
            onClick={() => onSeeAll?.(label)}
            className="w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            See all {rest.length} sessions
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Repos/Agents sidebar sections (DESIGN.md §6). Groups the local/cloud task
 * list by repository or by harness. Running sessions render above the
 * collapse, so they stay visible even when the section is collapsed.
 */
export default function ReposAgentsSection({ mode }) {
  const { agents } = useAppState();
  const [sessionsModal, setSessionsModal] = useState(null);

  const groups = useMemo(() => {
    const byKey = new Map();
    for (const agent of agents || []) {
      const key =
        mode === 'agents'
          ? providerMeta(agent.provider).label
          : sectionKey(agent);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(agent);
    }
    const entries = [...byKey.entries()].map(([key, tasks]) => ({
      key,
      tasks: sortTasks(tasks),
    }));
    entries.sort((a, b) => {
      const aRunning = a.tasks.some((t) => t.status === 'running') ? 0 : 1;
      const bRunning = b.tasks.some((t) => t.status === 'running') ? 0 : 1;
      if (aRunning !== bRunning) return aRunning - bRunning;
      return a.key.localeCompare(b.key);
    });
    return entries;
  }, [agents, mode]);

  const modalTasks = useMemo(() => {
    if (!sessionsModal) return [];
    return (agents || []).filter((agent) => {
      if (mode === 'agents') return providerMeta(agent.provider).label === sessionsModal;
      return sectionKey(agent) === sessionsModal;
    });
  }, [sessionsModal, agents, mode]);

  if (groups.length === 0) {
    return (
      <p className="px-2 py-3 text-[12px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        No {mode === 'repos' ? 'repositories' : 'harnesses'} yet. Connect a
        service in Plugins and run a task to see it here.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-0.5">
        {groups.map((group) => (
          <Section
            key={group.key}
            id={group.key}
            label={group.key}
            tasks={group.tasks}
            onSeeAll={setSessionsModal}
          />
        ))}
      </div>
      <RepoSessionsModal
        open={!!sessionsModal}
        title={sessionsModal}
        tasks={modalTasks}
        onClose={() => setSessionsModal(null)}
      />
    </>
  );
}
