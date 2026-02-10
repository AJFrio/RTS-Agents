import React, { useState, useEffect } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
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
    <Modal open={open} onClose={handleClose}>
      <div className="bg-white dark:bg-sidebar-dark border border-slate-200 dark:border-border-dark w-full max-w-2xl flex flex-col shadow-2xl rounded-2xl overflow-hidden">
        <div className="border-b border-slate-200 dark:border-border-dark p-6 flex justify-between items-center bg-slate-50 dark:bg-black/40">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-2 rounded-lg">
              <span className="material-symbols-outlined text-primary text-2xl">source</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Repository</h2>
              <p className="text-xs text-slate-500 font-medium">GitHub, local, or remote computer</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Where to create</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-white dark:!bg-slate-900 border border-slate-200 dark:border-border-dark text-slate-900 dark:!text-slate-200 text-sm py-3 px-4 rounded-lg focus:border-primary outline-none"
            >
              <option value="github">GitHub</option>
              <option value="local">This Computer (Local)</option>
              <option value="remote">Remote Computer</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Repository name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-new-repo"
              className="w-full bg-white dark:!bg-slate-900 border border-slate-200 dark:border-border-dark text-slate-900 dark:!text-slate-200 text-sm py-3 px-4 rounded-lg focus:border-primary outline-none"
            />
          </div>
          {location === 'github' && (
            <>
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Owner</label>
                <select
                  value={githubOwner}
                  onChange={(e) => setGithubOwner(e.target.value)}
                  className="w-full bg-white dark:!bg-slate-900 border border-slate-200 dark:border-border-dark text-slate-900 dark:!text-slate-200 text-sm py-3 px-4 rounded-lg focus:border-primary outline-none"
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
                  className={`flex-1 p-4 border rounded-lg text-left transition-colors ${!githubPrivate ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary/50'}`}
                >
                  <span className={`text-sm font-bold ${!githubPrivate ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>Public</span>
                  <p className="text-xs text-slate-400 mt-1">Anyone can see this repository</p>
                </button>
                <button
                  type="button"
                  onClick={() => setGithubPrivate(true)}
                  className={`flex-1 p-4 border rounded-lg text-left transition-colors ${githubPrivate ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary/50'}`}
                >
                  <span className={`text-sm font-bold ${githubPrivate ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>Private</span>
                  <p className="text-xs text-slate-400 mt-1">You choose who can see this repository</p>
                </button>
              </div>
            </>
          )}
          {location === 'local' && (
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Directory</label>
              <input
                type="text"
                value={localDir}
                onChange={(e) => setLocalDir(e.target.value)}
                placeholder={(state.settings.githubPaths || [])[0] || 'e.g., ~/GitHub'}
                className="w-full bg-white dark:!bg-slate-900 border border-slate-200 dark:border-border-dark text-slate-900 dark:!text-slate-200 text-sm py-3 px-4 rounded-lg focus:border-primary outline-none"
              />
            </div>
          )}
          {location === 'remote' && (
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block">Target device</label>
              <select
                value={remoteDeviceId}
                onChange={(e) => setRemoteDeviceId(e.target.value)}
                className="w-full bg-white dark:!bg-slate-900 border border-slate-200 dark:border-border-dark text-slate-900 dark:!text-slate-200 text-sm py-3 px-4 rounded-lg focus:border-primary outline-none"
              >
                <option value="">Select a computer...</option>
                {(state.computers?.list || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="border-t border-slate-200 dark:border-border-dark p-6 flex justify-between items-center bg-slate-50 dark:bg-black/20">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Name required</span>
          <div className="flex gap-4">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <span className="material-symbols-outlined text-sm animate-spin">sync</span> : null}
              Create
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
