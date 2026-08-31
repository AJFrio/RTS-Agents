import React from 'react';
import { StatusBadge } from '../ui/Badge.jsx';
import { getProviderDot, formatTimeAgo } from '../../utils/format.js';

/**
 * One project. Shows how much work lives there and how much needs attention,
 * so the grid answers "where should I look" without drilling in.
 */
const ProjectCard = React.memo(function ProjectCard({ group, onOpen }) {
  const { label, path, counts, providers, lastActivity } = group;
  const running = counts.running || 0;
  const failed = counts.failed || 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      title={path || 'No project directory recorded'}
      className="flex min-h-[132px] flex-col rounded-lg border border-slate-200 bg-white p-4 text-left transition-all hover:border-primary hover:shadow-md dark:border-border-dark dark:bg-card-dark"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-bold text-slate-800 dark:text-white">{label}</h3>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {counts.total}
        </span>
      </div>

      {path && <p className="mb-3 truncate text-xs text-slate-500 dark:text-slate-400">{path}</p>}

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {providers.map((provider) => (
            <span
              key={provider}
              title={provider}
              className={`h-2 w-2 rounded-full ${getProviderDot(provider)}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {running > 0 && <StatusBadge status="running">{running} running</StatusBadge>}
          {failed > 0 && <StatusBadge status="failed">{failed}</StatusBadge>}
          {lastActivity > 0 && (
            <span className="text-[10px] text-slate-400">
              {formatTimeAgo(new Date(lastActivity).toISOString())}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

export default function ProjectGrid({ groups, onOpen }) {
  if (!groups.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center dark:border-border-dark">
        <span className="material-symbols-outlined mb-4 text-4xl text-slate-500">folder_off</span>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          No projects match the current filters
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => (
        <ProjectCard key={group.key} group={group} onOpen={onOpen} />
      ))}
    </div>
  );
}
