/**
 * Branches View Component
 * 
 * View GitHub repositories and their pull requests
 */

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useApp } from '../store/AppContext';
import type { GithubRepo, PullRequest } from '../store/types';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function renderMarkdown(content: string): string {
  try {
    const html = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(html);
  } catch {
    return DOMPurify.sanitize(content);
  }
}

interface RepoCardProps {
  repo: GithubRepo;
  isSelected: boolean;
  onClick: () => void;
}

function RepoCard({ repo, isSelected, onClick }: RepoCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border-dark hover:border-slate-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm text-white truncate">{repo.name}</h4>
          <p className="font-display text-[10px] text-slate-500 truncate">{repo.full_name}</p>
        </div>
        {repo.private && (
          <span className="material-symbols-outlined text-slate-500 text-sm ml-2">lock</span>
        )}
      </div>
      {repo.description && (
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{repo.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
        <span className="material-symbols-outlined text-xs">schedule</span>
        <span>{formatTimeAgo(repo.updated_at)}</span>
      </div>
    </button>
  );
}

interface PRCardProps {
  pr: PullRequest;
  onView: () => void;
}

function PRCard({ pr, onView }: PRCardProps) {
  const isDraft = pr.draft;

  return (
    <button
      onClick={onView}
      className="w-full text-left p-4 bg-card-dark border border-border-dark hover:border-slate-600 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] text-slate-500">#{pr.number}</span>
          <span className={`px-2 py-0.5 font-display text-[9px] font-bold uppercase ${
            isDraft
              ? 'bg-slate-700 text-slate-400'
              : 'bg-emerald-500/20 text-emerald-500'
          }`}>
            {isDraft ? 'Draft' : 'Open'}
          </span>
        </div>
        <span className="material-symbols-outlined text-slate-500 text-sm">chevron_right</span>
      </div>

      <h4 className="font-bold text-sm text-white mb-2 line-clamp-2">{pr.title}</h4>

      <div className="flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-xs text-primary">merge</span>
          <span className="text-primary">{pr.head.ref}</span>
          <span className="material-symbols-outlined text-xs">arrow_forward</span>
          <span>{pr.base.ref}</span>
        </span>
      </div>

      <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-600">
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

interface PRDetailModalProps {
  pr: PullRequest | null;
  onClose: () => void;
}

function PRDetailModal({ pr, onClose }: PRDetailModalProps) {
  if (!pr) return null;

  const handleOpenInGitHub = () => {
    window.open(pr.html_url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-background-dark">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border-dark bg-sidebar-dark safe-top">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        <button
          onClick={handleOpenInGitHub}
          className="p-2 text-slate-400 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined">open_in_new</span>
        </button>
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 safe-bottom">
        {/* PR Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-display text-sm text-slate-500">#{pr.number}</span>
            <span className={`px-2 py-0.5 font-display text-[10px] font-bold uppercase ${
              pr.draft
                ? 'bg-slate-700 text-slate-400'
                : 'bg-emerald-500/20 text-emerald-500'
            }`}>
              {pr.draft ? 'Draft' : 'Open'}
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">{pr.title}</h2>
        </div>

        {/* Branch Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card-dark border border-border-dark p-3">
            <p className="font-display text-[9px] text-slate-500 uppercase mb-1">Source</p>
            <p className="font-mono text-xs text-primary truncate">{pr.head.ref}</p>
          </div>
          <div className="bg-card-dark border border-border-dark p-3">
            <p className="font-display text-[9px] text-slate-500 uppercase mb-1">Target</p>
            <p className="font-mono text-xs text-slate-300 truncate">{pr.base.ref}</p>
          </div>
        </div>

        {/* Description */}
        {pr.body && (
          <div className="bg-card-dark border border-border-dark p-4">
            <h3 className="font-display text-[10px] text-slate-500 uppercase tracking-wider mb-2">Description</h3>
            <div
              className="prose prose-sm prose-invert max-w-none text-slate-300"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(pr.body) }}
            />
          </div>
        )}

        {/* Merge Status */}
        <div className="bg-card-dark border border-border-dark p-4">
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
              <p className="text-sm font-bold text-white">
                {pr.mergeable === false
                  ? 'This branch has conflicts'
                  : pr.mergeable === true
                  ? 'No conflicts with base branch'
                  : 'Checking mergeability...'}
              </p>
              <p className="text-xs text-slate-500">
                {pr.mergeable === false
                  ? 'Resolve conflicts before merging'
                  : pr.mergeable === true
                  ? 'Merging can be performed automatically'
                  : 'Please wait'}
              </p>
            </div>
          </div>
        </div>

        {/* Open in GitHub Button */}
        <button
          onClick={handleOpenInGitHub}
          className="w-full flex items-center justify-center gap-2 bg-primary text-black py-3 font-display text-xs font-bold uppercase tracking-wider"
        >
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Open in GitHub
        </button>

        {/* Meta */}
        <div className="flex items-center justify-between text-[10px] text-slate-600 pt-2">
          <span>Updated {formatTimeAgo(pr.updated_at)}</span>
          <span>Created {formatTimeAgo(pr.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BranchesView() {
  const { state, dispatch, loadGithubRepos, loadPullRequests } = useApp();
  const { githubRepos, selectedRepo, pullRequests, loadingRepos, loadingPRs, configuredServices } = state;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);

  useEffect(() => {
    if (configuredServices.github) {
      loadGithubRepos();
    }
  }, [configuredServices.github, loadGithubRepos]);

  // Load PRs when repo is selected
  useEffect(() => {
    if (selectedRepo) {
      loadPullRequests(selectedRepo.owner.login, selectedRepo.name);
    }
  }, [selectedRepo, loadPullRequests]);

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
        <h3 className="mt-4 text-lg font-bold uppercase tracking-tight">GitHub Not Configured</h3>
        <p className="mt-2 text-slate-500 text-sm max-w-sm">
          Add your GitHub Personal Access Token in Settings to view branches and PRs.
        </p>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
          className="mt-4 bg-primary text-black px-6 py-2 font-display text-xs font-bold uppercase tracking-wider"
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
        <p className="mt-4 font-display text-xs text-slate-500 uppercase tracking-wider">Loading repositories...</p>
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
          className="mt-4 border border-border-dark text-slate-400 px-6 py-2 font-display text-xs font-bold uppercase tracking-wider hover:border-slate-600 transition-colors"
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
        <div className="flex-shrink-0 p-4 border-b border-border-dark">
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
              className="w-full bg-black border border-border-dark text-sm py-2.5 pl-10 pr-4 font-display text-xs placeholder:text-slate-500 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Repo List */}
          <div className="w-2/5 border-r border-border-dark overflow-y-auto p-2 space-y-2">
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
                <p className="mt-2 font-display text-xs text-slate-500">Loading PRs...</p>
              </div>
            ) : pullRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <span className="material-symbols-outlined text-3xl mb-2">merge</span>
                <span className="font-display text-xs">No open pull requests</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                    Open Pull Requests ({pullRequests.length})
                  </h3>
                </div>
                {pullRequests.map(pr => (
                  <PRCard
                    key={pr.id}
                    pr={pr}
                    onView={() => setSelectedPR(pr)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PR Detail Modal */}
      <PRDetailModal
        pr={selectedPR}
        onClose={() => setSelectedPR(null)}
      />
    </>
  );
}
