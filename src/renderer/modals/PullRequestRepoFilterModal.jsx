import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { IconClose, IconSearch } from '../components/ui/icons.jsx';
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
      <div>
        <div className="flex items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
              Filter Pull Requests
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Select repositories whose pull requests should be hidden on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Close pull request filters"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          {repoOptions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border-strong-light p-5 text-center dark:border-border-strong-dark">
              <IconSearch size={22} className="mx-auto text-neutral-400" />
              <p className="mt-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                No repositories to filter yet
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Repositories will appear here after pull requests are synced.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {repoOptions.map((repo) => (
                <li
                  key={repo.name}
                  className="flex items-center justify-between gap-3 rounded-md border border-border-light bg-inset-light px-3 py-2.5 dark:border-border-dark dark:bg-inset-dark"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={hiddenSet.has(repo.name)}
                      onChange={(e) => toggleRepo(repo.name, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                        {repo.name}
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {repo.count === 0
                          ? 'No open PRs currently'
                          : `${repo.count} open PR${repo.count !== 1 ? 's' : ''}`}
                      </span>
                    </span>
                  </label>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Hide
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-light px-4 py-3 dark:border-border-dark">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
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
