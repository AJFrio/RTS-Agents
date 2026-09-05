import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useBelowLg } from '../hooks/use-media-query.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { formatTimeAgo } from '../utils/format.js';
import TaskInfoModal from '../modals/TaskInfoModal.jsx';
import {
  IconRepositories,
  IconKey,
  IconExternal,
  IconSync,
  IconCheck,
  IconTasks,
  IconChevronLeft,
} from '../components/ui/icons.jsx';
import { statusMeta } from '../components/ui/status.jsx';

function prStateMeta(pr) {
  if (pr.state === 'open') return { key: 'running', label: 'Open' };
  if (pr.merged_at) return { key: 'completed', label: 'Merged' };
  return { key: 'idle', label: 'Closed' };
}

export default function BranchesPage() {
  const { state, dispatch, setView, api, openPrModal, openNewTaskModal } = useApp();
  const { github, configuredServices, currentView } = state;
  const [repoFilter, setRepoFilter] = useState('');
  const [prFilter, setPrFilter] = useState('open');
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [prError, setPrError] = useState(null);
  const [updatesContent, setUpdatesContent] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const belowLg = useBelowLg();

  const loadBranches = async () => {
    if (!api?.github?.getRepos || !configuredServices.github) return;
    dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: true } });
    try {
      const [result, localResult] = await Promise.all([
        api.github.getRepos(),
        api.projects?.getLocalRepos?.()?.catch(() => null) || Promise.resolve(null),
      ]);
      const localRepos = localResult?.success ? localResult.repos || [] : [];
      if (result?.success) {
        const repos = result.repos || [];
        dispatch({
          type: 'SET_GITHUB',
          payload: {
            repos,
            filteredRepos: repos,
            localRepos,
            loadingRepos: false,
          },
        });
      } else {
        throw new Error(result?.error || 'Failed to load repos');
      }
    } catch (err) {
      console.error(err);
      dispatch({ type: 'SET_GITHUB', payload: { loadingRepos: false } });
      if (github.repos.length === 0) {
        dispatch({ type: 'SET_GITHUB', payload: { error: err.message } });
      }
    }
  };

  useEffect(() => {
    if (currentView === 'branches' && configuredServices.github) {
      loadBranches();
    }
  }, [currentView, configuredServices.github]);

  const filteredRepos = useMemo(() => {
    const q = repoFilter.toLowerCase();
    if (!q) return github.repos || [];
    return (github.repos || []).filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [github.repos, repoFilter]);

  const selectRepo = async (repo, prState = prFilter) => {
    if (!repo || !api?.github?.getPrs) return;
    dispatch({ type: 'SET_GITHUB', payload: { selectedRepo: repo, prs: [], loadingPrs: true } });
    setPrError(null);
    setLoadingPrs(true);
    setUpdatesContent(null);

    // Fetch PRs
    try {
      const owner = repo.owner?.login || repo.owner;
      const result = await api.github.getPrs(owner, repo.name, prState);
      if (result?.success) {
        dispatch({ type: 'SET_GITHUB', payload: { prs: result.prs || [], loadingPrs: false } });
      } else throw new Error(result?.error);
    } catch (err) {
      setPrError(err.message);
      dispatch({ type: 'SET_GITHUB', payload: { prs: [], loadingPrs: false } });
    } finally {
      setLoadingPrs(false);
    }

    // Fetch UPDATES.md or UPDATE.md
    try {
      let content = null;

      const fetchFile = async (filename) => {
        if (repo.path) {
          // Local repo
          return await api.projects.getRepoFile(repo.path, filename);
        } else {
          // Remote repo
          const owner = repo.owner?.login || repo.owner;
          return await api.github.getRepoFile(owner, repo.name, filename);
        }
      };

      let result = await fetchFile('UPDATES.md');
      if (result?.success && result.content) {
        content = result.content;
      } else {
        result = await fetchFile('UPDATE.md');
        if (result?.success && result.content) {
          content = result.content;
        }
      }

      setUpdatesContent(content || null);
    } catch (err) {
      console.warn('Failed to fetch UPDATES.md:', err);
    }
  };

  const parsedTasks = useMemo(() => {
    if (!updatesContent) return [];

    const lines = updatesContent.split('\n');
    const tasks = [];
    let currentTask = null;

    lines.forEach(line => {
      // Level 1 bullet: * Title or - Title or 1. Title
      // We look for lines starting with optional space (0-1), then a bullet marker, then space
      const titleMatch = line.match(/^(\s{0,1})(?:-|\*|\d+\.)\s+(.*)/);
      // Level 2 bullet:   * Description or   - Description (2+ spaces)
      const descMatch = line.match(/^(\s{2,})(?:-|\*|\d+\.)\s+(.*)/);

      if (titleMatch && !descMatch) {
        if (currentTask) tasks.push(currentTask);
        currentTask = {
          title: titleMatch[2].trim(),
          descriptionLines: []
        };
      } else if (currentTask) {
        if (descMatch) {
            currentTask.descriptionLines.push(`* ${descMatch[2].trim()}`);
        } else if (line.trim()) {
            currentTask.descriptionLines.push(line.trim());
        }
      }
    });
    if (currentTask) tasks.push(currentTask);

    return tasks.map(t => ({
      title: t.title,
      description: t.descriptionLines.join('\n')
    }));
  }, [updatesContent]);

  const setPrFilterAndReload = (filter) => {
    setPrFilter(filter);
    if (github.selectedRepo) selectRepo(github.selectedRepo, filter);
  };

  if (!configuredServices.github) {
    return (
      <div id="view-branches" className="view-content">
        <EmptyState
          icon="fork_right"
          title="No Repositories Found"
          subtitle="Connect your GitHub account in Settings to view branches and PRs."
          actionLabel="Open Settings"
          onAction={() => setView('settings')}
        />
      </div>
    );
  }

  if (github.loadingRepos && (github.repos || []).length === 0) {
    return (
      <div id="view-branches" className="view-content">
        <LoadingSpinner label="Fetching Repositories..." />
      </div>
    );
  }

  const selectedRepo = github.selectedRepo;
  const prs = github.prs || [];

  const showList = !belowLg || !selectedRepo;
  const showDetail = !belowLg || !!selectedRepo;

  const clearSelectedRepo = () => {
    dispatch({ type: 'SET_GITHUB', payload: { selectedRepo: null, prs: [], loadingPrs: false } });
    setUpdatesContent(null);
    setPrError(null);
  };

  return (
    <div id="view-branches" className="view-content h-full">
      <div className="grid h-full grid-cols-1 gap-4 overflow-hidden lg:grid-cols-3">
        <div
          className={`${
            showList ? 'flex' : 'hidden'
          } h-full flex-col overflow-hidden rounded-lg border border-border-light bg-card-light dark:border-border-dark dark:bg-card-dark lg:col-span-1 lg:flex`}
        >
          <div className="border-b border-border-light p-2 dark:border-border-dark">
            <input
              type="text"
              id="repo-filter"
              placeholder="Filter repos..."
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="w-full"
            />
          </div>
          <div id="repo-list" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
            {filteredRepos.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                No repositories found
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectRepo(repo)}
                  onKeyDown={(e) => e.key === 'Enter' && selectRepo(repo)}
                  className={`repo-item cursor-pointer rounded-md border p-2 transition-colors ${
                    selectedRepo?.id === repo.id
                      ? 'border-border-strong-light bg-inset-light dark:border-border-strong-dark dark:bg-inset-dark'
                      : 'border-transparent hover:border-border-strong-light hover:bg-neutral-50 dark:hover:border-border-strong-dark dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <div className="mb-0.5 flex items-start justify-between gap-2">
                    <span className="truncate pr-1 text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {repo.name}
                    </span>
                    {repo.private && (
                      <IconKey size={11} className="mt-0.5 shrink-0 text-neutral-400" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>{formatTimeAgo(repo.updated_at)}</span>
                    <span title="Stars" className="shrink-0 font-mono tabular-nums">
                      {repo.stargazers_count ?? 0}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className={`${
            showDetail ? 'flex' : 'hidden'
          } h-full flex-col overflow-hidden rounded-lg border border-border-light bg-card-light dark:border-border-dark dark:bg-card-dark lg:col-span-2 lg:flex`}
        >
          {!selectedRepo ? (
            <div
              id="repo-details-placeholder"
              className="flex h-full flex-col items-center justify-center text-neutral-500 dark:text-neutral-400"
            >
              <IconRepositories size={20} />
              <span className="mt-2 text-[13px] font-medium">Select a repository</span>
            </div>
          ) : (
            <div id="repo-details-content" className="flex h-full flex-col">
              <div className="flex flex-col gap-2 border-b border-border-light bg-sidebar-light px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 dark:border-border-dark dark:bg-sidebar-dark">
                <div className="flex min-w-0 items-center gap-2">
                  {belowLg && (
                    <button
                      type="button"
                      id="repo-details-back"
                      onClick={clearSelectedRepo}
                      aria-label="Back to repositories"
                      className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      <IconChevronLeft size={16} />
                    </button>
                  )}
                  <h2
                    id="selected-repo-name"
                    className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100"
                  >
                    {selectedRepo.name}
                  </h2>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <a
                    id="selected-repo-link"
                    href={selectedRepo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-sm bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
                    onClick={(e) => {
                      e.preventDefault();
                      api?.openExternal?.(selectedRepo.html_url);
                    }}
                  >
                    <IconExternal size={12} />
                    Visit Repo
                  </a>
                  <div className="flex rounded-sm border border-border-light bg-inset-light p-0.5 dark:border-border-dark dark:bg-inset-dark">
                    <button
                      type="button"
                      id="pr-filter-open"
                      className={`rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors ${
                        prFilter === 'open'
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                          : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                      }`}
                      onClick={() => setPrFilterAndReload('open')}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      id="pr-filter-closed"
                      className={`rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors ${
                        prFilter === 'closed'
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                          : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                      }`}
                      onClick={() => setPrFilterAndReload('closed')}
                    >
                      Closed
                    </button>
                  </div>
                  <span className="rounded-sm border border-border-light bg-inset-light px-2 py-1 text-[11px] font-medium text-neutral-600 dark:border-border-dark dark:bg-inset-dark dark:text-neutral-400">
                    <span id="pr-count">{loadingPrs ? '…' : prs.length}</span>{' '}
                    {prFilter === 'open' ? 'Open PRs' : 'Closed PRs'}
                  </span>
                </div>
              </div>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  id="pr-list"
                  className={`${
                    updatesContent
                      ? 'min-h-0 flex-1 border-b border-border-light dark:border-border-dark'
                      : 'min-h-0 flex-1'
                  } space-y-1.5 overflow-y-auto p-3`}
                >
                  {loadingPrs && prs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10">
                      <IconSync size={18} className="animate-spin text-neutral-400" />
                      <span className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        Loading PRs...
                      </span>
                    </div>
                  )}
                  {prError && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-center text-xs font-medium text-red-700 dark:text-red-400">
                      Failed to load PRs: {prError}
                    </div>
                  )}
                  {!loadingPrs && !prError && prs.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
                      <IconCheck size={20} className="opacity-60" />
                      <span className="mt-2 text-[13px] font-medium">
                        No {prFilter} pull requests
                      </span>
                    </div>
                  )}
                  {!loadingPrs &&
                    prs.length > 0 &&
                    prs.map((pr) => {
                      const stateInfo = prStateMeta(pr);
                      const meta = statusMeta(stateInfo.key);
                      return (
                        <div
                          key={pr.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openPrModal(pr)}
                          className="pr-card cursor-pointer rounded-md border border-border-light bg-card-light p-3 transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                              #{pr.number}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.text}`}
                            >
                              {stateInfo.label}
                            </span>
                          </div>
                          <h4 className="line-clamp-2 text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                            {pr.title}
                          </h4>
                          <div className="mt-1 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                            <span className="font-mono">{pr.head?.ref}</span> →{' '}
                            <span className="font-mono">{pr.base?.ref}</span> ·{' '}
                            {formatTimeAgo(pr.updated_at)}
                          </div>
                        </div>
                      );
                    })}
                </div>
                {updatesContent && (
                  <div
                    id="updates-section"
                    className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar-light dark:bg-sidebar-dark"
                  >
                    <div className="flex items-center gap-2 border-b border-border-light bg-card-light px-3 py-2 dark:border-border-dark dark:bg-card-dark">
                      <IconTasks size={13} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        Tasks
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
                      {parsedTasks.length === 0 ? (
                        <div className="text-[13px] text-neutral-500 dark:text-neutral-400">
                          No tasks found in UPDATES.md
                        </div>
                      ) : (
                        parsedTasks.map((task, index) => (
                          <div
                            key={`task-${index}`}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border-light bg-card-light p-2.5 transition-colors hover:border-border-strong-light dark:border-border-dark dark:bg-card-dark dark:hover:border-border-strong-dark"
                            onClick={() => setSelectedTask(task)}
                          >
                            <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                              {task.title}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-sm bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:opacity-90 dark:bg-neutral-100 dark:text-neutral-900"
                              onClick={(e) => {
                                e.stopPropagation();
                                openNewTaskModal({
                                  initialPrompt: `${task.description}\n\nWhen finished, remove the task from the UPDATES.md file`,
                                });
                              }}
                            >
                              Build
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <TaskInfoModal
                  task={selectedTask}
                  onClose={() => setSelectedTask(null)}
                  onBuild={(task) => {
                    setSelectedTask(null);
                    openNewTaskModal({
                      initialPrompt: `${task.description}\n\nWhen finished, remove the task from the UPDATES.md file`,
                    });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
