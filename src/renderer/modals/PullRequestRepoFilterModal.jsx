import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { useApp } from '../context/AppContext.jsx';

function getPrRepoName(pr) {
  return pr?.base?.repo?.full_name || pr?.repository?.full_name || 'Unknown Repository';
}

export default function PullRequestRepoFilterModal({ open, onClose }) {
  const { state, dispatch } = useApp();
  const { allPrs, hiddenPrRepos } = state.github;
  const [draftHiddenRepos, setDraftHiddenRepos] = useState(hiddenPrRepos || []);

  useEffect(() => {
    if (open) {
      setDraftHiddenRepos(hiddenPrRepos || []);
    }
  }, [open, hiddenPrRepos]);

  const repoOptions = useMemo(() => {
    const reposByName = new Map();

    for (const pr of allPrs || []) {
      const name = getPrRepoName(pr);
      const current = reposByName.get(name) || { name, count: 0 };
      current.count += 1;
      reposByName.set(name, current);
    }

    for (const name of hiddenPrRepos || []) {
      if (!reposByName.has(name)) {
        reposByName.set(name, { name, count: 0 });
      }
    }

    return [...reposByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allPrs, hiddenPrRepos]);

  const hiddenSet = useMemo(() => new Set(draftHiddenRepos), [draftHiddenRepos]);

  const toggleRepo = (repoName, shouldHide) => {
    setDraftHiddenRepos((current) => {
      const next = new Set(current);
      if (shouldHide) next.add(repoName);
      else next.delete(repoName);
      return [...next].sort();
    });
  };

  const handleSave = () => {
    dispatch({ type: 'SET_PR_HIDDEN_REPOS', payload: draftHiddenRepos });
    onClose();
  };

  const handleClear = () => {
    setDraftHiddenRepos([]);
  };

  const activeCount = draftHiddenRepos.length;

  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-lg">
      <div className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-border-dark flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
              Filter Pull Requests
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Select repositories whose pull requests should be hidden on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-primary transition-colors"
            aria-label="Close pull request filters"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {repoOptions.length === 0 ? (
            <div className="border border-dashed border-slate-200 dark:border-border-dark rounded-xl p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-slate-400">filter_list_off</span>
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                No repositories to filter yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Repositories will appear here after pull requests are synced.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {repoOptions.map((repo) => (
                <li
                  key={repo.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-[#1A1A1A] px-3 py-3"
                >
                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hiddenSet.has(repo.name)}
                      onChange={(e) => toggleRepo(repo.name, e.target.checked)}
                      className="form-checkbox h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {repo.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {repo.count === 0
                          ? 'No open PRs currently'
                          : `${repo.count} open PR${repo.count !== 1 ? 's' : ''}`}
                      </span>
                    </span>
                  </label>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Hide
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-border-dark flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {activeCount > 0
              ? `${activeCount} repo${activeCount !== 1 ? 's' : ''} hidden`
              : 'No repos hidden'}
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Button variant="ghost" onClick={handleClear}>
                Clear
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
