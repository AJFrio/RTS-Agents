import { useEffect, useState } from 'react';
import { useApp } from '../store/AppContext';
import { githubService } from '../services/github-service';
import type { PullRequest } from '../store/types';
import PRCard from './PRCard';
import PRDetailModal from './PRDetailModal';

export default function PullRequestsView() {
  const { state, dispatch, loadAllPullRequests } = useApp();
  const { allPullRequests, loadingAllPRs, configuredServices } = state;

  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);

  useEffect(() => {
    if (configuredServices.github) {
      loadAllPullRequests();
    }
  }, [configuredServices.github, loadAllPullRequests]);

  const handleRefresh = () => {
    loadAllPullRequests();
  };

  const handleViewPR = async (pr: PullRequest) => {
    setSelectedPR(pr);
    if (pr.base.repo) {
      try {
        const fullPr = await githubService.getPullRequestDetails(
          pr.base.repo.owner.login,
          pr.base.repo.name,
          pr.number
        );

        setSelectedPR((current) => {
          // Use unique ID instead of PR number (which is only unique per repo)
          if (current && current.id === pr.id) {
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
    if (!pr.base.repo) return;
    if (!window.confirm(`Are you sure you want to merge pull request #${pr.number}?`)) return;

    try {
      await githubService.mergePullRequest(
        pr.base.repo.owner.login,
        pr.base.repo.name,
        pr.number
      );
      // Close modal
      setSelectedPR(null);
      // Refresh list
      await loadAllPullRequests();
    } catch (err) {
      console.error('Failed to merge PR:', err);
      alert(`Failed to merge PR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMarkReady = async (pr: PullRequest) => {
    if (!pr.base.repo) return;
    if (!pr.node_id) {
        alert('Cannot update PR: Missing Node ID');
        return;
    }
    if (!window.confirm(`Mark #${pr.number} as ready for review? This will notify reviewers.`)) return;

    try {
      await githubService.markPullRequestReadyForReview(pr.node_id);

      // Refresh details for the current PR to update UI immediately
      const updatedPr = await githubService.getPullRequestDetails(
        pr.base.repo.owner.login,
        pr.base.repo.name,
        pr.number
      );
      setSelectedPR(updatedPr);

      // Also refresh the background list
      loadAllPullRequests();
    } catch (err) {
      console.error('Failed to update PR:', err);
      alert(`Failed to update PR: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Not configured state
  if (!configuredServices.github) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <span className="material-symbols-outlined text-slate-600 text-6xl">fork_right</span>
        <h3 className="mt-4 text-lg font-semibold">GitHub Not Configured</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          Add your GitHub Personal Access Token in Settings to view pull requests.
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

  return (
    <>
      <div className="flex flex-col h-full bg-slate-50 dark:bg-black">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-border-dark bg-white dark:bg-sidebar-dark safe-top">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pull Requests</h1>
            <button
              onClick={handleRefresh}
              disabled={loadingAllPRs}
              className="p-2 text-slate-500 hover:text-primary transition-colors"
            >
              <span className={`material-symbols-outlined text-lg ${loadingAllPRs ? 'animate-spin' : ''}`}>
                sync
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 safe-bottom">
          {loadingAllPRs && allPullRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
              <p className="mt-4 text-sm text-slate-500">Loading pull requests...</p>
            </div>
          ) : allPullRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 px-6 text-center">
              <span className="material-symbols-outlined text-slate-600 text-6xl">check_circle</span>
              <h3 className="mt-4 text-lg font-bold uppercase tracking-tight">No Open Pull Requests</h3>
              <p className="mt-2 text-slate-500 text-sm max-w-sm">
                You are all caught up!
              </p>
              <button
                onClick={handleRefresh}
                className="mt-4 border border-border-dark text-slate-400 px-6 py-2 text-sm font-semibold rounded-lg hover:border-slate-600 hover:shadow-sm transition-all duration-200"
              >
                Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-3 pb-20">
              {allPullRequests.map(pr => (
                <div key={pr.id}>
                    <div className="mb-1 ml-1 text-xs font-semibold text-slate-500">
                        {pr.base?.repo?.full_name || 'Unknown Repository'}
                    </div>
                    <PRCard
                        pr={pr}
                        onView={() => handleViewPR(pr)}
                    />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PRDetailModal
        pr={selectedPR}
        onClose={() => setSelectedPR(null)}
        onMerge={handleMergePr}
        onMarkReady={handleMarkReady}
      />
    </>
  );
}
