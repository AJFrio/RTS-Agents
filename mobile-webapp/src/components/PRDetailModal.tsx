import { useState } from 'react';
import type { PullRequest } from '../store/types';
import { formatTimeAgo, renderMarkdown } from '../utils/format';

interface PRDetailModalProps {
  pr: PullRequest | null;
  onClose: () => void;
  onMerge: (pr: PullRequest) => Promise<void>;
  onMarkReady: (pr: PullRequest) => Promise<void>;
}

export default function PRDetailModal({ pr, onClose, onMerge, onMarkReady }: PRDetailModalProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);

  if (!pr) return null;

  const handleOpenInGitHub = () => {
    window.open(pr.html_url, '_blank');
  };

  const handleMerge = async () => {
    setIsActionLoading(true);
    try {
      await onMerge(pr);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMarkReady = async () => {
    setIsActionLoading(true);
    try {
      await onMarkReady(pr);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background-light dark:bg-background-dark">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark safe-top">
        <button
          onClick={onClose}
          disabled={isActionLoading}
          className="p-2 -ml-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <button
          onClick={handleOpenInGitHub}
          disabled={isActionLoading}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined">open_in_new</span>
        </button>
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 safe-bottom">
        {/* PR Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-slate-500">#{pr.number}</span>
            <span className={`px-2.5 py-1 text-xs font-medium rounded-md ${
              pr.draft
                ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                : 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500'
            }`}>
              {pr.draft ? 'Draft' : 'Open'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{pr.title}</h2>
        </div>

        {/* Branch Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-3">
            <p className="font-display text-[9px] text-slate-500 uppercase mb-1">Source</p>
            <p className="font-mono text-xs text-primary truncate">{pr.head.ref}</p>
          </div>
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-3">
            <p className="font-display text-[9px] text-slate-500 uppercase mb-1">Target</p>
            <p className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate">{pr.base.ref}</p>
          </div>
        </div>

        {/* Description */}
        {pr.body && (
          <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Description</h3>
            <div
              className="prose prose-sm prose-invert max-w-none text-slate-600 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(pr.body) }}
            />
          </div>
        )}

        {/* Merge Status */}
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4">
          <div className="flex items-center gap-3">
            <span className={`material-symbols-outlined ${
              pr.mergeable === false
                ? 'text-red-500'
                : pr.mergeable === true
                ? 'text-emerald-500'
                : 'text-yellow-500'
            }`}>
              {pr.mergeable === false ? 'error' : pr.mergeable === true ? 'check_circle' : 'pending'}
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {pr.draft
                  ? 'This is a draft pull request'
                  : pr.mergeable === false
                  ? 'This branch has conflicts'
                  : pr.mergeable === true
                  ? 'No conflicts with base branch'
                  : 'Checking mergeability...'}
              </p>
              <p className="text-xs text-slate-500">
                {pr.draft
                  ? 'Review and publish to enable merging'
                  : pr.mergeable === false
                  ? 'Resolve conflicts before merging'
                  : pr.mergeable === true
                  ? 'Merging can be performed automatically'
                  : 'Please wait'}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {pr.draft ? (
            <button
              onClick={handleMarkReady}
              disabled={isActionLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-black py-3 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isActionLoading ? (
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
              ) : (
                <span className="material-symbols-outlined text-sm">rate_review</span>
              )}
              {isActionLoading ? 'Updating...' : 'Review & Publish'}
            </button>
          ) : pr.mergeable === true ? (
            <button
              onClick={handleMerge}
              disabled={isActionLoading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-black py-3 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isActionLoading ? (
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
              ) : (
                <span className="material-symbols-outlined text-sm">merge</span>
              )}
              {isActionLoading ? 'Merging...' : 'Merge Pull Request'}
            </button>
          ) : null}

          {/* Open in GitHub Button */}
          <button
            onClick={handleOpenInGitHub}
            disabled={isActionLoading}
            className="w-full flex items-center justify-center gap-2 border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 py-3 text-sm font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-card-dark disabled:opacity-50 transition-all duration-200"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            Open in GitHub
          </button>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-600 pt-2">
          <span>Updated {formatTimeAgo(pr.updated_at)}</span>
          <span>Created {formatTimeAgo(pr.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
