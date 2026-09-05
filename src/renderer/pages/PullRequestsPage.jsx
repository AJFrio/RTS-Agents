import React, { useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import {
  IconAlert,
  IconCheck,
  IconSearch,
  IconClock,
  IconArrowRight,
  IconChevronRight,
} from '../components/ui/icons.jsx';
import { formatTimeAgo } from '../utils/format.js';

export default function PullRequestsPage() {
  const { state, dispatch, loadAllPrs, openPrModal, setView } = useApp();
  const { github, configuredServices, settings } = state;
  const { allPrs, loadingAllPrs, allPrsError } = github;
  const { autoPolling, pollingInterval } = settings;
  const visiblePrs = useMemo(() => {
    const hiddenRepos = new Set(github.hiddenPrRepos || []);
    if (hiddenRepos.size === 0) return allPrs;

    return allPrs.filter((pr) => {
      const repoName = pr.base?.repo?.full_name || pr.repository?.full_name || 'Unknown Repository';
      return !hiddenRepos.has(repoName);
    });
  }, [allPrs, github.hiddenPrRepos]);

  useEffect(() => {
    if (configuredServices.github) {
      loadAllPrs();
    }
  }, [configuredServices.github, loadAllPrs]);

  useEffect(() => {
    if (!configuredServices.github || !autoPolling) return;

    const intervalId = setInterval(() => {
      loadAllPrs();
    }, pollingInterval || 30000);

    return () => clearInterval(intervalId);
  }, [configuredServices.github, autoPolling, pollingInterval, loadAllPrs]);

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
      <div
        id="view-pull-requests"
        className="view-content flex h-full flex-col items-center justify-center"
      >
        <IconAlert size={22} className="text-red-600 dark:text-red-400" />
        <h2 className="mt-3 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          Failed to load Pull Requests
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">{allPrsError}</p>
        <button
          type="button"
          onClick={() => loadAllPrs()}
          className="mt-4 rounded-sm bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="view-pull-requests" className="view-content mx-auto w-full max-w-5xl">
      {allPrs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border-light text-neutral-500 dark:border-border-dark dark:text-neutral-400">
          <IconCheck size={20} className="opacity-60" />
          <span className="mt-2 text-[13px] font-medium">No open pull requests</span>
        </div>
      ) : visiblePrs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border-light text-neutral-500 dark:border-border-dark dark:text-neutral-400">
          <IconSearch size={20} className="opacity-60" />
          <span className="mt-2 text-[13px] font-medium">
            No pull requests match your repo filter
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_PR_HIDDEN_REPOS', payload: [] })}
            className="mt-4 rounded-sm bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
          >
            Clear Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {visiblePrs.map((pr) => {
            // Extract repo name if available in pr object structure
            // Usually pr.base.repo.full_name or similar
            const repoName =
              pr.base?.repo?.full_name || pr.repository?.full_name || 'Unknown Repository';

            return (
              <div
                key={pr.id}
                role="button"
                tabIndex={0}
                onClick={() => openPrModal(pr)}
                onKeyDown={(e) => e.key === 'Enter' && openPrModal(pr)}
                className="pr-card group cursor-pointer rounded-lg border border-border-light bg-card-light p-3 transition-colors hover:border-border-strong-light hover:bg-neutral-50 dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="max-w-[min(200px,70vw)] truncate rounded-sm bg-inset-light px-1.5 py-0.5 font-medium text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
                        {repoName}
                      </span>
                      <span className="max-w-[40vw] truncate font-mono sm:max-w-none">{pr.head.ref}</span>
                      <IconArrowRight size={10} className="shrink-0" />
                      <span className="max-w-[40vw] truncate font-mono sm:max-w-none">{pr.base.ref}</span>
                    </div>
                    <h3 className="truncate pr-2 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                      {pr.title}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <span className="flex items-center gap-1">
                        <IconClock size={11} className="shrink-0" />
                        {formatTimeAgo(pr.updated_at)}
                      </span>
                      <span>#{pr.number}</span>
                      <span className="ml-auto lg:ml-0">{pr.user?.login}</span>
                    </div>
                  </div>
                  <IconChevronRight
                    size={14}
                    className="mt-1 shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-600 dark:text-neutral-600 dark:group-hover:text-neutral-300"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
