import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { IconClose, IconGitBranch, IconSync } from '../components/ui/icons.jsx';
import { useApp } from '../context/AppContext.jsx';

export default function CreateRepoModal({ open, onClose, api }) {
  const { state, loadSettings } = useApp();
  const [location, setLocation] = useState('github');
  const [name, setName] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [githubPrivate, setGithubPrivate] = useState(false);
  const [localDir, setLocalDir] = useState('');
  const [remoteDeviceId, setRemoteDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [owners, setOwners] = useState([]);

  useEffect(() => {
    if (open && api?.github?.getOwners) {
      api.github.getOwners().then((res) => setOwners(res?.owners || []));
    }
  }, [open, api]);

  const reset = () => {
    setName('');
    setGithubOwner('');
    setGithubPrivate(false);
    setLocalDir('');
    setRemoteDeviceId('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    const n = name.trim();
    if (!n) {
      setError('Repository name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (location === 'github') {
        if (!api?.github?.createRepo) throw new Error('GitHub API not available');
        const ownerType = owners.find((o) => o.login === githubOwner)?.type === 'Organization' ? 'org' : 'user';
        await api.github.createRepo({
          ownerType,
          owner: githubOwner || owners[0]?.login,
          name: n,
          private: githubPrivate,
        });
        handleClose();
        if (state.currentView === 'branches') loadSettings();
      } else if (location === 'local') {
        const dir = localDir.trim() || (state.settings.githubPaths || [])[0];
        if (!dir) throw new Error('Directory is required for local repos');
        if (!api?.projects?.createLocalRepo) throw new Error('Local repo API not available');
        const result = await api.projects.createLocalRepo({ name: n, directory: dir });
        if (!result?.success) throw new Error(result?.error);
        handleClose();
      } else if (location === 'remote') {
        if (!remoteDeviceId) throw new Error('Select a remote computer');
        if (!api?.projects?.enqueueCreateRepo) throw new Error('Remote repo API not available');
        const result = await api.projects.enqueueCreateRepo({ deviceId: remoteDeviceId, name: n });
        if (!result?.success) throw new Error(result?.error);
        handleClose();
      }
    } catch (err) {
      setError(err?.message || 'Create repo failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} size="md">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-inset-light p-1.5 text-neutral-600 dark:bg-inset-dark dark:text-neutral-300">
              <IconGitBranch size={15} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">Create Repository</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">GitHub, local, or remote computer</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close create repository"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Where to create</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full"
            >
              <option value="github">GitHub</option>
              <option value="local">This Computer (Local)</option>
              <option value="remote">Remote Computer</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Repository name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-new-repo"
              className="w-full"
            />
          </div>
          {location === 'github' && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Owner</label>
                <select
                  value={githubOwner}
                  onChange={(e) => setGithubOwner(e.target.value)}
                  className="w-full"
                >
                  <option value="">Select...</option>
                  {owners.map((o) => (
                    <option key={o.login} value={o.login}>{o.login}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGithubPrivate(false)}
                  className={`flex-1 rounded-md border p-3 text-left transition-colors ${!githubPrivate ? 'border-neutral-900 bg-neutral-900/5 dark:border-neutral-100 dark:bg-neutral-100/5' : 'border-border-light hover:border-border-strong-light dark:border-border-dark dark:hover:border-border-strong-dark'}`}
                >
                  <span className={`text-[13px] font-semibold ${!githubPrivate ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'}`}>Public</span>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">Anyone can see this repository</p>
                </button>
                <button
                  type="button"
                  onClick={() => setGithubPrivate(true)}
                  className={`flex-1 rounded-md border p-3 text-left transition-colors ${githubPrivate ? 'border-neutral-900 bg-neutral-900/5 dark:border-neutral-100 dark:bg-neutral-100/5' : 'border-border-light hover:border-border-strong-light dark:border-border-dark dark:hover:border-border-strong-dark'}`}
                >
                  <span className={`text-[13px] font-semibold ${githubPrivate ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'}`}>Private</span>
                  <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">You choose who can see this repository</p>
                </button>
              </div>
            </>
          )}
          {location === 'local' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Directory</label>
              <input
                type="text"
                value={localDir}
                onChange={(e) => setLocalDir(e.target.value)}
                placeholder={(state.settings.githubPaths || [])[0] || 'e.g., ~/GitHub'}
                className="w-full font-mono text-[12px]"
              />
            </div>
          )}
          {location === 'remote' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Target device</label>
              <select
                value={remoteDeviceId}
                onChange={(e) => setRemoteDeviceId(e.target.value)}
                className="w-full"
              >
                <option value="">Select a computer...</option>
                {(state.computers?.list || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-border-light px-4 py-3 dark:border-border-dark">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Name required</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <IconSync size={13} className="animate-spin" /> : null}
              Create
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
