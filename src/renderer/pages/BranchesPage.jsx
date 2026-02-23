import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.jsx';
import { formatTimeAgo } from '../utils/format.js';
import TaskInfoModal from '../modals/TaskInfoModal.jsx';

export default function BranchesPage() {
  const { state, dispatch, setView, api, openPrModal, openNewTaskModal } = useApp();
  const { github, configuredServices, currentView } = state;
  const [repoFilter, setRepoFilter] = useState('');
  const [prFilter, setPrFilter] = useState('open');
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [prError, setPrError] = useState(null);
  const [updatesContent, setUpdatesContent] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

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

  return (
    <div id="view-branches" className="view-content h-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">
        <div className="lg:col-span-1 border border-slate-200 dark:border-border-dark bg-white dark:bg-[#1A1A1A] rounded-xl flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-border-dark">
            <input
              type="text"
              id="repo-filter"
              placeholder="Filter repos..."
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="w-full bg-white dark:bg-black border border-slate-200 dark:border-border-dark text-slate-800 dark:text-slate-300 text-xs py-2 px-3 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <div id="repo-list" className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {filteredRepos.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm font-medium">No repositories found</div>
            ) : (
              filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectRepo(repo)}
                  onKeyDown={(e) => e.key === 'Enter' && selectRepo(repo)}
                  className={`repo-item p-3 border rounded-lg mb-1 cursor-pointer transition-all ${
                    selectedRepo?.id === repo.id
                      ? 'bg-primary/10 border-primary'
                      : 'border-slate-200 dark:border-transparent hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-300 text-sm truncate pr-2">
                      {repo.name}
                    </span>
                    {repo.private && <span className="material-symbols-outlined text-xs text-slate-500">lock</span>}
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>{formatTimeAgo(repo.updated_at)}</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">star</span> {repo.stargazers_count ?? 0}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 border border-slate-200 dark:border-border-dark bg-white dark:bg-[#1A1A1A] rounded-xl flex flex-col h-full overflow-hidden">
          {!selectedRepo ? (
            <div id="repo-details-placeholder" className="flex flex-col items-center justify-center h-full text-slate-500">
              <span className="material-symbols-outlined text-4xl mb-2">arrow_back</span>
              <span className="text-sm font-medium">Select a repository</span>
            </div>
          ) : (
            <div id="repo-details-content" className="flex flex-col h-full">
              <div className="p-6 border-b border-slate-200 dark:border-border-dark flex justify-between items-center bg-slate-50 dark:bg-black/20">
                <h2 id="selected-repo-name" className="text-xl font-semibold text-slate-800 dark:text-white tracking-tight">
                  {selectedRepo.name}
                </h2>
                <div className="flex items-center gap-3">
                  <a
                    id="selected-repo-link"
                    href={selectedRepo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-primary text-black px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 flex items-center gap-2"
                    onClick={(e) => {
                      e.preventDefault();
                      api?.openExternal?.(selectedRepo.html_url);
                    }}
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    Visit Repo
                  </a>
                  <div className="flex bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-0.5 rounded-lg gap-0.5">
                    <button
                      type="button"
                      id="pr-filter-open"
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        prFilter === 'open' ? 'bg-primary text-black' : 'text-slate-600 dark:text-slate-400'
                      }`}
                      onClick={() => setPrFilterAndReload('open')}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      id="pr-filter-closed"
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        prFilter === 'closed' ? 'bg-primary text-black' : 'text-slate-600 dark:text-slate-400'
                      }`}
                      onClick={() => setPrFilterAndReload('closed')}
                    >
                      Closed
                    </button>
                  </div>
                  <span className="px-2 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg">
                    <span id="pr-count">{loadingPrs ? '…' : prs.length}</span> {prFilter === 'open' ? 'Open PRs' : 'Closed PRs'}
                  </span>
                </div>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden relative">
                <div id="pr-list" className={`${updatesContent ? 'flex-1 min-h-0 border-b border-slate-200 dark:border-border-dark' : 'flex-1 min-h-0'} overflow-y-auto p-6 space-y-4 transition-all duration-300`}>
                  {loadingPrs && prs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32">
                      <span className="material-symbols-outlined text-primary text-3xl animate-spin">sync</span>
                      <span className="text-sm text-slate-500 mt-2">Loading PRs...</span>
                    </div>
                  )}
                  {prError && (
                    <div className="p-4 border border-red-500/50 bg-red-500/10 text-red-500 text-sm font-medium text-center rounded-lg">
                      Failed to load PRs: {prError}
                    </div>
                  )}
                  {!loadingPrs && !prError && prs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                      <span className="material-symbols-outlined text-4xl mb-2 opacity-50">check_circle</span>
                      <span className="text-sm font-medium">No {prFilter} pull requests</span>
                    </div>
                  )}
                  {!loadingPrs && prs.length > 0 &&
                    prs.map((pr) => (
                      <div
                        key={pr.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openPrModal(pr)}
                        className="p-4 border border-slate-200 dark:border-border-dark rounded-xl hover:border-primary/50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-slate-500 technical-font text-sm">#{pr.number}</span>
                          <span
                            className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                              pr.state === 'open'
                                ? 'bg-emerald-500/20 text-emerald-500'
                                : pr.merged_at
                                  ? 'bg-purple-500/20 text-purple-500'
                                  : 'bg-red-500/20 text-red-500'
                            }`}
                          >
                            {pr.state === 'open' ? 'Open' : pr.merged_at ? 'Merged' : 'Closed'}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-800 dark:text-white line-clamp-2">{pr.title}</h4>
                        <div className="mt-2 text-xs text-slate-500">
                          {pr.head?.ref} → {pr.base?.ref} · {formatTimeAgo(pr.updated_at)}
                        </div>
                      </div>
                    ))}
                </div>
                {updatesContent && (
                  <div id="updates-section" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50 dark:bg-black/20 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="p-4 border-b border-slate-200 dark:border-border-dark flex items-center gap-2 bg-white dark:bg-[#1A1A1A]">
                      <span className="material-symbols-outlined text-primary">campaign</span>
                      <span className="font-semibold text-sm text-slate-700 dark:text-slate-300">Tasks</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      {parsedTasks.length === 0 ? (
                        <div className="text-slate-500 text-sm italic">No tasks found in UPDATES.md</div>
                      ) : (
                        parsedTasks.map((task, index) => (
                          <div
                            key={`task-${index}`}
                            className="p-4 border border-slate-200 dark:border-border-dark rounded-xl bg-white dark:bg-[#1A1A1A] flex justify-between items-center gap-4 mb-2 cursor-pointer hover:border-primary/50 transition-all"
                            onClick={() => setSelectedTask(task)}
                          >
                            <div className="flex-1 font-medium text-slate-800 dark:text-slate-200 text-sm">
                              {task.title}
                            </div>
                            <button
                              className="px-3 py-1.5 text-xs font-semibold bg-primary text-black rounded hover:bg-primary/90 transition-colors shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openNewTaskModal({
                                  initialPrompt: `${task.description} When finished, remove the task from the UPDATES.md file`,
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
                      initialPrompt: `${task.description} When finished, remove the task from the UPDATES.md file`,
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
