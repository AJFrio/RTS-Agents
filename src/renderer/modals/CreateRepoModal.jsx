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
      <div className="bg-sidebar-dark border border-border-dark w-full max-w-2xl flex flex-col shadow-2xl">
        <div className="border-b border-border-dark p-6 flex justify-between items-center bg-black/40">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-2xl">source</span>
            <div>
              <h2 className="technical-font text-lg font-bold text-white tracking-widest">Create Repository</h2>
              <p className="text-[10px] technical-font text-slate-500">GitHub, local, or remote computer</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="text-slate-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Where to create</label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 rounded-lg"
            >
              <option value="github">GITHUB</option>
              <option value="local">THIS COMPUTER (LOCAL)</option>
              <option value="remote">REMOTE COMPUTER</option>
            </select>
          </div>
          <div>
            <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Repository name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-new-repo"
              className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 rounded-lg"
            />
          </div>
          {location === 'github' && (
            <>
              <div>
                <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Owner</label>
                <select
                  value={githubOwner}
                  onChange={(e) => setGithubOwner(e.target.value)}
                  className="w-full bg-black border border-border-dark text-slate-300 text-xs py-3 px-4 rounded-lg"
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
                  className={`flex-1 p-4 border rounded-lg text-left ${!githubPrivate ? 'border-primary bg-primary/10' : 'border-border-dark'}`}
                >
                  <span className="text-xs font-bold text-slate-300">PUBLIC</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGithubPrivate(true)}
                  className={`flex-1 p-4 border rounded-lg text-left ${githubPrivate ? 'border-primary bg-primary/10' : 'border-border-dark'}`}
                >
                  <span className="text-xs font-bold text-slate-300">PRIVATE</span>
                </button>
              </div>
            </>
          )}
          {location === 'local' && (
            <div>
              <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Directory</label>
              <input
                type="text"
                value={localDir}
                onChange={(e) => setLocalDir(e.target.value)}
                placeholder={(state.settings.githubPaths || [])[0] || 'e.g., ~/GitHub'}
                className="w-full bg-black border border-border-dark text-slate-300 text-xs py-3 px-4 rounded-lg"
              />
            </div>
          )}
          {location === 'remote' && (
            <div>
              <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Target device</label>
              <select
                value={remoteDeviceId}
                onChange={(e) => setRemoteDeviceId(e.target.value)}
                className="w-full bg-black border border-border-dark text-slate-300 text-xs py-3 px-4 rounded-lg"
              >
                <option value="">SELECT A COMPUTER...</option>
                {(state.computers?.list || []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name || d.id}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="border-t border-border-dark p-6 flex justify-between items-center bg-black/20">
          <span className="text-[10px] technical-font text-slate-600">Name required</span>
          <div className="flex gap-4">
            <Button variant="secondary" onClick={handleClose}>CANCEL</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <span className="material-symbols-outlined text-sm animate-spin">sync</span> : null}
              CREATE
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
