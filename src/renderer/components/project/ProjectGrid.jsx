import React from 'react';
import { getProviderDot, formatTimeAgo } from '../../utils/format.js';

/**
 * One project. Shows how much work lives there and how much needs attention,
 * so the grid answers "where should I look" without drilling in.
 */
const ProjectCard = React.memo(function ProjectCard({ group, onOpen, onToggleArchive, isArchived }) {
  const { label, path, counts, providers, lastActivity } = group;
  const running = counts.running || 0;
  const failed = counts.failed || 0;

  return (
    <div
      className={`group relative flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors ${
        isArchived
          ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-border-dark dark:bg-card-dark/50'
          : 'border-slate-200 bg-white hover:border-primary dark:border-border-dark dark:bg-card-dark'
      }`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleArchive(group.key);
        }}
        title={isArchived ? 'Restore project' : 'Archive project'}
        aria-label={isArchived ? `Restore ${label}` : `Archive ${label}`}
        className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <span className="material-symbols-outlined text-[16px]">
          {isArchived ? 'unarchive' : 'archive'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen(group.key)}
        title={path || 'No project directory recorded'}
        className="flex flex-col gap-1 text-left"
      >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-white">{label}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {running > 0 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              {running}
            </span>
          )}
          {failed > 0 && (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
              {failed}
            </span>
          )}
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {counts.total}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate">{path || 'No directory recorded'}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {providers.map((provider) => (
            <span
              key={provider}
              title={provider}
              className={`h-1.5 w-1.5 rounded-full ${getProviderDot(provider)}`}
            />
          ))}
          {lastActivity > 0 && (
            <span className="text-[10px] text-slate-400">
              {formatTimeAgo(new Date(lastActivity).toISOString())}
            </span>
          )}
        </span>
      </div>
      </button>
    </div>
  );
});

export default function ProjectGrid({ groups, onOpen, onToggleArchive, archivedKeys = [] }) {
  const archivedSet = new Set(archivedKeys);

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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {groups.map((group) => (
        <ProjectCard
          key={group.key}
          group={group}
          onOpen={onOpen}
          onToggleArchive={onToggleArchive}
          isArchived={archivedSet.has(group.key)}
        />
      ))}
    </div>
  );
}
