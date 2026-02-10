import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { formatTimeAgo } from '../utils/format.js';

export default function PullRequestsPage() {
  const { state, dispatch, loadAllPrs, openPrModal, setView } = useApp();
  const { github, configuredServices } = state;
  const { allPrs, loadingAllPrs, allPrsError } = github;

  useEffect(() => {
    if (configuredServices.github) {
      loadAllPrs();
    }
  }, [configuredServices.github, loadAllPrs]);

  if (!configuredServices.github) {
    return (
      <div id="view-pull-requests" className="view-content">
        <EmptyState
          icon="merge_type"
          title="No Pull Requests Found"
          subtitle="Connect your GitHub account in Settings to view pull requests."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  if (loadingAllPrs && allPrs.length === 0) {
    return (
      <div id="view-pull-requests" className="view-content">
        <LoadingSpinner label="Fetching Pull Requests..." />
      </div>
    );
  }

  if (allPrsError) {
     return (
      <div id="view-pull-requests" className="view-content flex flex-col items-center justify-center h-full">
        <div className="text-red-500 mb-2">
           <span className="material-symbols-outlined text-4xl">error</span>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">Failed to load Pull Requests</h2>
        <p className="text-sm text-slate-500">{allPrsError}</p>
        <button
          onClick={() => loadAllPrs()}
          className="mt-4 px-4 py-2 bg-primary text-black rounded-lg text-sm font-medium hover:brightness-110"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="view-pull-requests" className="view-content p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-white tracking-tight">Pull Requests</h1>
          <button
            onClick={() => loadAllPrs()}
            className="p-2 text-slate-500 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Refresh"
          >
            <span className={`material-symbols-outlined ${loadingAllPrs ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>

        {allPrs.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
            <span className="text-sm font-medium">No open pull requests</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {allPrs.map((pr) => {
              // Extract repo name if available in pr object structure
              // Usually pr.base.repo.full_name or similar
              const repoName = pr.base?.repo?.full_name || pr.repository?.full_name || 'Unknown Repository';

              return (
                <div
                  key={pr.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPrModal(pr)}
                  onKeyDown={(e) => e.key === 'Enter' && openPrModal(pr)}
                  className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark rounded-xl p-4 hover:border-primary/50 cursor-pointer transition-all shadow-sm hover:shadow-md group"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 text-xs text-slate-500">
                         <span className="font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                           {repoName}
                         </span>
                         <span>•</span>
                         <span className="font-mono">{pr.head.ref}</span>
                         <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                         <span className="font-mono">{pr.base.ref}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white truncate pr-4 group-hover:text-primary transition-colors">
                        {pr.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          {formatTimeAgo(pr.updated_at)}
                        </span>
                        <span>#{pr.number}</span>
                        <div className="flex items-center gap-2 ml-auto lg:ml-0">
                           <img src={pr.user?.avatar_url} alt={pr.user?.login} className="w-5 h-5 rounded-full" />
                           <span>{pr.user?.login}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 self-center">
                       <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary transition-colors">chevron_right</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
