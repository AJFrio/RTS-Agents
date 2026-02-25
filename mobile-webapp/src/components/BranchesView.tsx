/**
 * Branches View Component
 * 
 * View GitHub repositories and their pull requests
 */

import { useEffect, useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { githubService } from '../services/github-service';
import type { GithubRepo, PullRequest } from '../store/types';
import { formatTimeAgo } from '../utils/format';
import PRCard from './PRCard';
import PRDetailModal from './PRDetailModal';

interface RepoCardProps {
  repo: GithubRepo;
  isSelected: boolean;
  onClick: () => void;
}

function RepoCard({ repo, isSelected, onClick }: RepoCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border rounded-xl transition-all duration-200 shadow-sm ${
        isSelected
          ? 'border-primary bg-primary/10 shadow-md'
          : 'border-slate-200 dark:border-border-dark hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{repo.name}</h4>
          <p className="text-xs text-slate-500 truncate">{repo.full_name}</p>
        </div>
        {repo.private && (
          <span className="material-symbols-outlined text-slate-500 text-sm ml-2">lock</span>
        )}
      </div>
      {repo.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{repo.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
        <span className="material-symbols-outlined text-xs">schedule</span>
        <span>{formatTimeAgo(repo.updated_at)}</span>
      </div>
    </button>
  );
}

export default function BranchesView() {
  const { state, dispatch, loadGithubRepos, loadPullRequests, openNewTaskModal } = useApp();
  const { githubRepos, selectedRepo, pullRequests, loadingRepos, loadingPRs, configuredServices } = state;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);
  const [updatesContent, setUpdatesContent] = useState<string | null>(null);

  const handleViewPR = async (pr: PullRequest) => {
    setSelectedPR(pr);
    if (selectedRepo) {
      try {
        const fullPr = await githubService.getPullRequestDetails(
          selectedRepo.owner.login,
          selectedRepo.name,
          pr.number
        );

        setSelectedPR((current) => {
          if (current && current.number === pr.number) {
            return fullPr;
          }
          return current;
        });
      } catch (err) {
        console.error('Failed to load PR details:', err);
      }
    }
  };

  const handleMergePr = async (pr: PullRequest) => {
    if (!selectedRepo) return;
    if (!window.confirm(`Are you sure you want to merge pull request #${pr.number}?`)) return;

    try {
      await githubService.mergePullRequest(selectedRepo.owner.login, selectedRepo.name, pr.number);
      // Close modal
      setSelectedPR(null);
      // Refresh list
      await loadPullRequests(selectedRepo.owner.login, selectedRepo.name);
    } catch (err) {
      console.error('Failed to merge PR:', err);
      alert(`Failed to merge PR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMarkReady = async (pr: PullRequest) => {
    if (!selectedRepo) return;
    if (!pr.node_id) {
        alert('Cannot update PR: Missing Node ID');
        return;
    }
    if (!window.confirm(`Mark #${pr.number} as ready for review? This will notify reviewers.`)) return;

    try {
      await githubService.markPullRequestReadyForReview(pr.node_id);

      // Refresh details for the current PR to update UI immediately
      const updatedPr = await githubService.getPullRequestDetails(selectedRepo.owner.login, selectedRepo.name, pr.number);
      setSelectedPR(updatedPr);

      // Also refresh the background list
      loadPullRequests(selectedRepo.owner.login, selectedRepo.name);
    } catch (err) {
      console.error('Failed to update PR:', err);
      alert(`Failed to update PR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    if (configuredServices.github) {
      loadGithubRepos();
    }
  }, [configuredServices.github, loadGithubRepos]);

  // Load PRs and UPDATES.md when repo is selected
  useEffect(() => {
    if (selectedRepo) {
      loadPullRequests(selectedRepo.owner.login, selectedRepo.name);

      // Fetch UPDATES.md
      const fetchUpdates = async () => {
        setUpdatesContent(null);
        try {
          // Try UPDATES.md first
          let content = await githubService.getRepoFileContent(selectedRepo.owner.login, selectedRepo.name, 'UPDATES.md');

          // Fallback to UPDATE.md
          if (!content) {
            content = await githubService.getRepoFileContent(selectedRepo.owner.login, selectedRepo.name, 'UPDATE.md');
          }

          setUpdatesContent(content);
        } catch (err) {
          console.warn('Failed to fetch UPDATES.md:', err);
        }
      };

      fetchUpdates();
    }
  }, [selectedRepo, loadPullRequests]);

  const parsedTasks = useMemo(() => {
    if (!updatesContent) return [];

    const lines = updatesContent.split('\n');
    const tasks: { title: string; description: string }[] = [];
    let currentTask: { title: string; descriptionLines: string[] } | null = null;

    for (const line of lines) {
      // Level 1 bullet: * Title or - Title or 1. Title
      // We look for lines starting with optional space (0-1), then a bullet marker, then space
      const titleMatch = line.match(/^(\s{0,1})(?:-|\*|\d+\.)\s+(.*)/);
      // Level 2 bullet:   * Description or   - Description (2+ spaces)
      const descMatch = line.match(/^(\s{2,})(?:-|\*|\d+\.)\s+(.*)/);

      if (titleMatch && !descMatch) {
        if (currentTask) {
          tasks.push({
            title: currentTask.title,
            description: currentTask.descriptionLines.join('\n')
          });
        }
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
    }
    if (currentTask) {
        tasks.push({
            title: currentTask.title,
            description: currentTask.descriptionLines.join('\n')
        });
    }

    return tasks;
  }, [updatesContent]);

  const handleSelectRepo = (repo: GithubRepo) => {
    dispatch({ type: 'SET_SELECTED_REPO', payload: repo });
  };

  const handleRefresh = () => {
    loadGithubRepos();
    if (selectedRepo) {
      loadPullRequests(selectedRepo.owner.login, selectedRepo.name);
    }
  };

  // Filter repos by search
  const filteredRepos = githubRepos.filter(repo => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.full_name.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query)
    );
  });

  // Not configured state
  if (!configuredServices.github) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">fork_right</span>
        <h3 className="mt-4 text-lg font-semibold">GitHub Not Configured</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          Add your GitHub Personal Access Token in Settings to view branches and PRs.
        </p>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
          className="mt-4 bg-primary text-black px-6 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          Open Settings
        </button>
      </div>
    );
  }

  // Loading state
  if (loadingRepos && githubRepos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
        <p className="mt-4 text-sm text-slate-500">Loading repositories...</p>
      </div>
    );
  }

  // Empty state
  if (githubRepos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">folder_off</span>
        <h3 className="mt-4 text-lg font-bold uppercase tracking-tight">No Repositories Found</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          No repositories were found for your GitHub account.
        </p>
        <button
          onClick={handleRefresh}
          className="mt-4 border border-border-dark text-slate-400 px-6 py-2 text-sm font-semibold rounded-lg hover:border-slate-600 hover:shadow-sm transition-all duration-200"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-border-dark">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-xs text-slate-500">
              {githubRepos.length} Repositories
            </span>
            <button
              onClick={handleRefresh}
              disabled={loadingRepos}
              className="p-2 text-slate-500 hover:text-primary transition-colors"
            >
              <span className={`material-symbols-outlined text-lg ${loadingRepos ? 'animate-spin' : ''}`}>
                sync
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <span className="material-symbols-outlined text-sm">search</span>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-border-dark text-sm py-2.5 pl-10 pr-4 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200 shadow-sm"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Repo List */}
          <div className="w-2/5 border-r border-slate-200 dark:border-border-dark overflow-y-auto p-2 space-y-2">
            {filteredRepos.map(repo => (
              <RepoCard
                key={repo.id}
                repo={repo}
                isSelected={selectedRepo?.id === repo.id}
                onClick={() => handleSelectRepo(repo)}
              />
            ))}
          </div>

          {/* PR List */}
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedRepo ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <span className="material-symbols-outlined text-3xl mb-2">arrow_back</span>
                <span className="font-display text-xs">Select a repository</span>
              </div>
            ) : loadingPRs ? (
              <div className="flex flex-col items-center justify-center h-full">
                <span className="material-symbols-outlined text-primary text-3xl animate-spin">sync</span>
                <p className="mt-2 text-sm text-slate-500">Loading PRs...</p>
              </div>
            ) : pullRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <span className="material-symbols-outlined text-3xl mb-2">merge</span>
                <span className="font-display text-xs">No open pull requests</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Open Pull Requests ({pullRequests.length})
                  </h3>
                </div>
                {pullRequests.map(pr => (
                  <PRCard
                    key={pr.id}
                    pr={pr}
                    onView={() => handleViewPR(pr)}
                  />
                ))}
              </div>
            )}

            {/* Tasks Section */}
            {updatesContent && (
              <div className="mt-6 border-t border-slate-200 dark:border-border-dark pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-primary text-sm">campaign</span>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Tasks ({parsedTasks.length})
                  </h3>
                </div>

                {parsedTasks.length === 0 ? (
                   <p className="text-xs text-slate-500 italic">No tasks found in UPDATES.md</p>
                ) : (
                  <div className="space-y-3">
                    {parsedTasks.map((task, index) => (
                      <div
                        key={`task-${index}`}
                        className="p-4 bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark rounded-xl shadow-sm"
                      >
                         <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                               <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-1">{task.title}</h4>
                               {task.description && (
                                 <p className="text-xs text-slate-500 line-clamp-2">{task.description}</p>
                               )}
                            </div>
                            <button
                              onClick={() => openNewTaskModal({
                                initialPrompt: `${task.description}\n\nWhen finished, remove the task from the UPDATES.md file`
                              })}
                              className="px-3 py-1.5 bg-primary text-black text-xs font-semibold rounded-lg hover:shadow-md transition-all shrink-0"
                            >
                              Build
                            </button>
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PR Detail Modal */}
      <PRDetailModal
        pr={selectedPR}
        onClose={() => setSelectedPR(null)}
        onMerge={handleMergePr}
        onMarkReady={handleMarkReady}
      />
    </>
  );
}
