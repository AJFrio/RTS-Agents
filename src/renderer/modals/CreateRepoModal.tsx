import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const CreateRepoModal: React.FC = () => {
  const { modals, closeModal, loadBranches, computers } = useApp();

  const [location, setLocation] = useState<'github' | 'local' | 'remote'>('github');
  const [name, setName] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [localDir, setLocalDir] = useState('');
  const [remoteDeviceId, setRemoteDeviceId] = useState('');
  const [owners, setOwners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (modals.createRepo) {
      // Load owners if github
      loadOwners();
    }
  }, [modals.createRepo]);

  const loadOwners = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.github.getOwners();
      if (result.success) {
        const list = [];
        if (result.user) list.push({ value: `user:${result.user.login}`, label: `${result.user.login} (personal)` });
        if (result.orgs) result.orgs.forEach((o: any) => list.push({ value: `org:${o.login}`, label: `${o.login} (org)` }));
        setOwners(list);
        if (list.length > 0) setGithubOwner(list[0].value);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      if (location === 'github') {
        const [ownerType, owner] = githubOwner.split(':');
        await window.electronAPI.github.createRepo({ ownerType, owner, name, private: isPrivate });
      } else if (location === 'local') {
        await window.electronAPI.projects.createLocalRepo({ name, directory: localDir });
      } else if (location === 'remote') {
        await window.electronAPI.projects.enqueueCreateRepo({ deviceId: remoteDeviceId, name });
      }
      closeModal('createRepo');
      loadBranches();
      alert('Repository created successfully');
    } catch (err) {
      alert(`Failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  if (!modals.createRepo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => closeModal('createRepo')}></div>

      <div className="relative bg-sidebar-dark border border-border-dark w-full max-w-2xl flex flex-col shadow-2xl">
        <div className="border-b border-border-dark p-6 flex justify-between items-center bg-black/40">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-2xl">source</span>
            <div>
              <h2 className="technical-font text-lg font-bold text-white tracking-widest">Create Repository</h2>
              <p className="text-[10px] technical-font text-slate-500">GitHub, local, or remote computer</p>
            </div>
          </div>
          <button onClick={() => closeModal('createRepo')} className="text-slate-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Where to create</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as any)}
                className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer hover:border-slate-600"
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
                placeholder="my-new-repo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          </div>

          {location === 'github' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">cloud</span>
                <h3 className="technical-font font-bold text-slate-300">GitHub Settings</h3>
              </div>
              <div>
                <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Owner</label>
                <select
                  value={githubOwner}
                  onChange={(e) => setGithubOwner(e.target.value)}
                  className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                >
                  {owners.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setIsPrivate(false)}
                  className={`border border-border-dark p-4 text-left transition-all ${!isPrivate ? 'bg-primary/20 border-primary' : 'bg-black/20 hover:border-primary/50'}`}
                >
                  <div className="technical-font text-[11px] font-bold text-slate-300 mb-1">PUBLIC</div>
                  <div className="text-[9px] text-slate-500 uppercase leading-tight">Visible to everyone</div>
                </button>
                <button
                  onClick={() => setIsPrivate(true)}
                  className={`border border-border-dark p-4 text-left transition-all ${isPrivate ? 'bg-primary/20 border-primary' : 'bg-black/20 hover:border-primary/50'}`}
                >
                  <div className="technical-font text-[11px] font-bold text-slate-300 mb-1">PRIVATE</div>
                  <div className="text-[9px] text-slate-500 uppercase leading-tight">Invite-only access</div>
                </button>
              </div>
            </div>
          )}

          {location === 'local' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">folder</span>
                <h3 className="technical-font font-bold text-slate-300">Local Settings</h3>
              </div>
              <div>
                <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Directory</label>
                <input
                  type="text"
                  placeholder="e.g., ~/GitHub"
                  value={localDir}
                  onChange={(e) => setLocalDir(e.target.value)}
                  className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
            </div>
          )}

          {location === 'remote' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">computer</span>
                <h3 className="technical-font font-bold text-slate-300">Remote Computer</h3>
              </div>
              <div>
                <label className="technical-font text-[10px] text-slate-500 mb-2 block uppercase">Target Device</label>
                <select
                  value={remoteDeviceId}
                  onChange={(e) => setRemoteDeviceId(e.target.value)}
                  className="w-full bg-black border border-border-dark text-slate-300 technical-font text-xs py-3 px-4 focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                >
                  <option value="">SELECT A COMPUTER...</option>
                  {computers.list.map(d => (
                    <option key={d.id} value={d.id}>{d.name || d.id}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border-dark p-6 flex justify-end items-center bg-black/20 gap-4">
          <button onClick={() => closeModal('createRepo')} className="px-6 py-2 text-xs font-semibold rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors duration-200">CANCEL</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-primary text-black px-8 py-3 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-110 active:scale-[0.98] flex items-center gap-2 transition-all duration-200"
          >
            {loading && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
            CREATE
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateRepoModal;
