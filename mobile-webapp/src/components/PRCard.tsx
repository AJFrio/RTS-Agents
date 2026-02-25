import React from 'react';
import type { PullRequest } from '../store/types';
import { formatTimeAgo } from '../utils/format';

interface PRCardProps {
  pr: PullRequest;
  onView: () => void;
}

export default function PRCard({ pr, onView }: PRCardProps) {
  const isDraft = pr.draft;

  return (
    <button
      onClick={onView}
      className="w-full text-left p-4 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition-all duration-200 shadow-sm"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">#{pr.number}</span>
          <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${
            isDraft
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              : 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500'
          }`}>
            {isDraft ? 'Draft' : 'Open'}
          </span>
        </div>
        <span className="material-symbols-outlined text-slate-500 text-sm">chevron_right</span>
      </div>

      <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-2 line-clamp-2">{pr.title}</h4>

      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-xs text-primary">merge</span>
          <span className="text-primary">{pr.head.ref}</span>
          <span className="material-symbols-outlined text-xs">arrow_forward</span>
          <span>{pr.base.ref}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-600">
        <img
          src={pr.user.avatar_url}
          alt={pr.user.login}
          className="w-4 h-4 rounded-full"
        />
        <span>{pr.user.login}</span>
        <span>|</span>
        <span>{formatTimeAgo(pr.updated_at)}</span>
      </div>
    </button>
  );
}
