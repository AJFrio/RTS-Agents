import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const NewTaskModal: React.FC = () => {
  const { modals, closeModal, refreshAgents, configuredServices, capabilities, computers, loading } = useApp();

  // Local Form State
  const [environment, setEnvironment] = useState<'cloud' | 'local' | 'remote'>('local');
  const [targetDevice, setTargetDevice] = useState<any>('local'); // 'local', 'cloud', or device object
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [repo, setRepo] = useState<any>(null); // Selected repo object
  const [repoSearch, setRepoSearch] = useState('');
  const [branch, setBranch] = useState('main');
  const [prompt, setPrompt] = useState('');
  const [autoPr, setAutoPr] = useState(true);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [creating, setCreating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (modals.newTask) {
      setEnvironment('local');
      setTargetDevice('local');
      setSelectedService(null);
      setRepo(null);
      setRepoSearch('');
      setBranch('main');
      setPrompt('');
      setAutoPr(true);
      setRepositories([]);
    }
  }, [modals.newTask]);

  // Load repositories when service is selected
  useEffect(() => {
    if (selectedService) {
      loadRepositories(selectedService);
    }
  }, [selectedService, targetDevice]);

  const loadRepositories = async (service: string) => {
    if (!window.electronAPI) return;
    setLoadingRepos(true);
    try {
      // In a real app, logic to switch between local/cloud/remote fetch would go here
      // For now, fetching local/cloud repos based on service
      const result = await window.electronAPI.getRepositories(service);
      setRepositories(result.repositories || []);
    } catch (err) {
      console.error('Failed to load repos', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedService || !prompt) return;
    if (selectedService !== 'claude-cloud' && selectedService !== 'codex' && !repo) {
       // Repo required for most
       return;
    }

    setCreating(true);
    try {
      const options: any = {
        prompt,
        autoCreatePr: autoPr,
        repository: repo?.id || repo?.path || repo?.url || (selectedService === 'codex' || selectedService === 'claude-cloud' ? null : ''),
        branch: branch,
        targetDeviceId: typeof targetDevice === 'object' ? targetDevice.id : undefined,
        // ... add other fields as needed
        projectPath: repo?.path
      };

      if (selectedService === 'jules') options.source = repo?.id; // Jules uses source ID

      const result = await window.electronAPI.createTask(selectedService, options);
      if (result.success) {
        alert('Task created successfully');
        closeModal('newTask');
        refreshAgents();
      } else {
        alert(`Failed to create task: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  if (!modals.newTask) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => closeModal('newTask')}></div>

      <div className="relative bg-white dark:bg-sidebar-dark w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-border-dark">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-border-dark bg-white dark:bg-[#16181d]">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-1.5 rounded-lg">
              <span className="material-symbols-outlined text-primary text-xl">add_task</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Create New Agent Task</h2>
              <p className="text-xs text-slate-500 font-medium">Configure and deploy a new coding agent</p>
            </div>
          </div>
          <button onClick={() => closeModal('newTask')} className="text-slate-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside className="w-80 border-r border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-[#0d0e11] overflow-y-auto custom-scrollbar p-6">
            <div className="flex flex-col gap-8">
              {/* 1. Environment */}
              <section>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">1. Environment</label>
                <div className="grid grid-cols-1 gap-2">
                  {['cloud', 'local', 'remote'].map((env) => (
                    <button
                      key={env}
                      onClick={() => {
                        setEnvironment(env as any);
                        if (env !== 'remote') setTargetDevice(env);
                        else setTargetDevice(null); // Reset until device selected
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                        environment === env
                          ? 'border-primary bg-primary/5 text-white'
                          : 'border-slate-200 dark:border-border-dark hover:bg-slate-800 text-slate-400'
                      }`}
                    >
                      <span className={`material-symbols-outlined ${environment === env ? 'text-primary' : 'text-slate-400'}`}>
                        {env === 'cloud' ? 'cloud' : env === 'local' ? 'terminal' : 'dns'}
                      </span>
                      <span className={`text-sm font-bold ${environment === env ? 'text-slate-300' : 'text-slate-400'}`}>
                        {env.charAt(0).toUpperCase() + env.slice(1)}
                      </span>
                    </button>
                  ))}

                  {environment === 'remote' && (
                    <div className="mt-2">
                       <select
                         onChange={(e) => {
                           const device = computers.list.find(d => d.id === e.target.value);
                           setTargetDevice(device);
                         }}
                         className="w-full bg-black border border-border-dark text-slate-300 text-xs py-2 px-3 rounded-lg focus:ring-1 focus:ring-primary outline-none"
                       >
                          <option value="">Select Device...</option>
                          {computers.list.map(d => (
                            <option key={d.id} value={d.id}>{d.name || d.id}</option>
                          ))}
                       </select>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. Select Agent */}
              <section>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">2. Select Agent</label>
                <div className="flex flex-col gap-1">
                  {[
                    { id: 'jules', name: 'Jules', type: 'cloud' },
                    { id: 'cursor', name: 'Cursor', type: 'cloud' },
                    { id: 'claude-cloud', name: 'Claude Cloud', type: 'cloud' },
                    { id: 'gemini', name: 'Gemini CLI', type: 'cli' },
                    { id: 'claude-cli', name: 'Claude CLI', type: 'cli' },
                    { id: 'codex', name: 'Codex', type: 'cli' }
                  ].map(agent => (
                    <label key={agent.id} className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${selectedService === agent.id ? 'bg-slate-800/50 border-primary' : 'border-slate-700 hover:bg-slate-800 text-slate-400'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{agent.name}</span>
                      </div>
                      <input
                        type="radio"
                        name="agent"
                        checked={selectedService === agent.id}
                        onChange={() => setSelectedService(agent.id)}
                        className="text-primary focus:ring-0 bg-slate-900 border-slate-700"
                      />
                    </label>
                  ))}
                </div>
              </section>

              {/* 3. Target Repository */}
              <section>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">3. Target Repository</label>
                <select
                  disabled={!selectedService || loadingRepos}
                  value={repo ? (repo.id || repo.path || repo.url) : ''}
                  onChange={(e) => {
                    const selected = repositories.find(r => (r.id || r.path || r.url) === e.target.value);
                    setRepo(selected);
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg py-2.5 px-3 text-sm text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">{loadingRepos ? 'Loading...' : 'Select Repo...'}</option>
                  {repositories.map((r, i) => (
                    <option key={i} value={r.id || r.path || r.url}>
                      {r.name || r.id || r.path}
                    </option>
                  ))}
                </select>
              </section>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0d0e11] overflow-hidden">
            <div className="flex-1 p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-3 flex-1">
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  Task Definition & Instructions
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full flex-1 bg-slate-50 dark:bg-[#0d0e11] border border-slate-200 dark:border-border-dark rounded-xl p-5 text-slate-900 dark:text-slate-100 text-base font-medium leading-relaxed focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none placeholder:text-slate-600"
                  placeholder="Describe the task in detail..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-slate-200 dark:border-border-dark flex items-center justify-between bg-slate-50 dark:bg-[#16181d]">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoPr}
                    onChange={(e) => setAutoPr(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-primary focus:ring-0"
                  />
                  <label className="text-xs font-semibold text-slate-400">Auto-commit changes</label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => closeModal('newTask')} className="px-5 py-2.5 text-sm font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={creating || !prompt || !selectedService}
                  className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
                  <span>Initialize Agent</span>
                  <span className="material-symbols-outlined text-sm">rocket_launch</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default NewTaskModal;
