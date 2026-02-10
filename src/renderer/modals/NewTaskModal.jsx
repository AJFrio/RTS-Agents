import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { useApp } from '../context/AppContext.jsx';
import { getProviderDisplayName } from '../utils/format.js';

const CACHE_KEY_PREFIX = 'rts_repo_cache_';

function getCachedRepos(provider) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY_PREFIX + provider) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCachedRepos(provider, repos) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY_PREFIX + provider, JSON.stringify(repos));
    }
  } catch {
    // ignore
  }
}

const CLOUD_PROVIDERS = ['jules', 'cursor', 'codex', 'claude-cloud'];
const LOCAL_PROVIDERS = ['gemini', 'cursor', 'codex', 'claude-cli'];
const REMOTE_PROVIDERS = ['gemini', 'claude-cli', 'codex'];

function capabilityForProvider(state, provider) {
  if (provider === 'claude-cloud' || provider === 'claude-cli') {
    return state.capabilities?.claude;
  }
  return state.capabilities?.[provider];
}

function getAgentsForEnvironment(state, environment) {
  if (environment === 'cloud') {
    return CLOUD_PROVIDERS.filter((id) => capabilityForProvider(state, id)?.cloud);
  }
  if (environment === 'remote') {
    return REMOTE_PROVIDERS.filter((id) => capabilityForProvider(state, id)?.local);
  }
  return LOCAL_PROVIDERS.filter((id) => capabilityForProvider(state, id)?.local);
}

export default function NewTaskModal({ open, onClose, api }) {
  const { state, fetchComputers } = useApp();
  const [environment, setEnvironment] = useState(state.newTask?.environment ?? 'cloud');
  const [selectedService, setSelectedService] = useState(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [branch, setBranch] = useState('main');
  const [autoPr, setAutoPr] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [targetDeviceId, setTargetDeviceId] = useState('');

  const agentsForEnv = useMemo(() => getAgentsForEnvironment(state, environment), [state.capabilities, environment]);
  const filteredAgents = useMemo(() => {
    if (!agentFilter.trim()) return agentsForEnv;
    const q = agentFilter.trim().toLowerCase();
    return agentsForEnv.filter((id) => getProviderDisplayName(id).toLowerCase().includes(q));
  }, [agentsForEnv, agentFilter]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.trim().toLowerCase();
    return repos.filter((r) => {
      const name = (r.name || r.displayName || r.id || '').toLowerCase();
      return name.includes(q);
    });
  }, [repos, repoSearch]);

  const selectedRepoDisplay = useMemo(() => {
    if (!selectedRepo) return '';
    const r = repos.find((x) => (x.id ?? x.path) === selectedRepo);
    return r ? (r.name || r.displayName || r.id || r.path || selectedRepo) : selectedRepo;
  }, [repos, selectedRepo]);

  // When modal opens, ensure environment is synced; when Remote, refresh computers
  useEffect(() => {
    if (open && environment === 'remote' && fetchComputers) fetchComputers();
  }, [open, environment, fetchComputers]);

  // When environment changes, clear agent/repo if no longer valid
  useEffect(() => {
    if (!open) return;
    const stillValid = selectedService && agentsForEnv.includes(selectedService.provider);
    if (!stillValid) {
      setSelectedService(null);
      setSelectedRepo('');
      setRepos([]);
    }
  }, [environment, agentsForEnv, open]);

  // When agent is selected, load repos with optimistic cache
  useEffect(() => {
    const provider = selectedService?.provider;
    if (!provider || !api?.getRepositories) return;

    const cached = getCachedRepos(provider);
    if (cached.length > 0) {
      setRepos(cached);
      setSelectedRepo((prev) => {
        if (prev && cached.some((r) => (r.id ?? r.path) === prev)) return prev;
        return cached[0]?.id ?? cached[0]?.path ?? '';
      });
    } else {
      setRepos([]);
      setSelectedRepo('');
    }

    setLoadingRepos(true);
    api
      .getRepositories(provider)
      .then((result) => {
        const list = result?.success && Array.isArray(result.repositories) ? result.repositories : [];
        setRepos(list);
        setCachedRepos(provider, list);
        setSelectedRepo((prev) => {
          if (list.length === 0) return '';
          if (prev && list.some((r) => (r.id ?? r.path) === prev)) return prev;
          return list[0]?.id ?? list[0]?.path ?? '';
        });
      })
      .catch(() => {
        // Keep cached list if any
      })
      .finally(() => setLoadingRepos(false));
  }, [selectedService?.provider, api]);

  const handleEnvironmentChange = (env) => {
    setEnvironment(env);
    setSelectedService(null);
    setSelectedRepo('');
    setRepos([]);
  };

  const handleSubmit = async () => {
    const p = selectedService?.provider;
    if (!p || !prompt.trim()) {
      setToast('Please fill in all required fields');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!api?.createTask) return;

    const isRemote = environment === 'remote' && targetDeviceId;
    if (isRemote && !selectedRepo) {
      setToast('Please select a repository for remote tasks');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setCreating(true);
    try {
      const options = {
        prompt: prompt.trim(),
        branch: branch || 'main',
        autoCreatePr: autoPr,
      };
      if (selectedRepo) {
        options.repository = selectedRepo;
        if (isRemote) options.projectPath = selectedRepo;
      }
      if (isRemote) options.targetDeviceId = targetDeviceId;

      await api.createTask(p, options);
      setPrompt('');
      setSelectedService(null);
      setSelectedRepo('');
      setTargetDeviceId('');
      onClose();
    } catch (err) {
      console.error(err);
      setToast(err?.message || 'Failed to create task');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const needsRepo = selectedService && selectedService.provider !== 'claude-cloud';
  const showRepoSection = selectedService;
  const computersList = state.computers?.list ?? [];

  return (
    <Modal open={open} onClose={onClose}>
      <div
        id="new-task-modal"
        className="relative bg-white dark:bg-sidebar-dark w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-border-dark"
      >
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
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex gap-6 min-h-0">
          {/* Left column */}
          <div className="flex flex-col gap-6 w-[42%] min-w-0 shrink-0">
            {/* ENVIRONMENT */}
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 block">
                Environment
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'cloud', label: 'Cloud', icon: 'cloud' },
                  { id: 'local', label: 'Local', icon: 'computer' },
                  { id: 'remote', label: 'Remote', icon: 'dns' },
                ].map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleEnvironmentChange(id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      environment === id
                        ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20'
                        : 'border-slate-200 dark:border-border-dark text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* SELECT AGENT */}
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                Select Agent
              </label>
              <input
                type="text"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                placeholder="Filter agents..."
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 mb-2"
                aria-label="Filter agents"
              />
              <div className="border border-slate-200 dark:border-border-dark rounded-lg divide-y divide-slate-200 dark:divide-border-dark max-h-40 overflow-y-auto">
                {filteredAgents.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-500">No agents available for this environment.</div>
                ) : (
                  filteredAgents.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedService({ provider: id })}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      aria-pressed={selectedService?.provider === id}
                    >
                      <span className="text-slate-800 dark:text-slate-200">{getProviderDisplayName(id)}</span>
                      {selectedService?.provider === id && (
                        <span className="material-symbols-outlined text-primary text-lg">radio_button_checked</span>
                      )}
                      {selectedService?.provider !== id && (
                        <span className="material-symbols-outlined text-slate-400 text-lg">radio_button_unchecked</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* TARGET REPOSITORY */}
            {showRepoSection && (
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                  Target Repository {needsRepo ? '' : '(optional)'}
                </label>
                {selectedService?.provider === 'claude-cloud' ? (
                  <div className="text-sm text-slate-500 py-2">Cloud prompt-only; no repository required.</div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg">
                      <span className="material-symbols-outlined text-slate-400 pl-3 text-lg">search</span>
                      <input
                        type="text"
                        value={repoDropdownOpen ? repoSearch : selectedRepoDisplay}
                        onChange={(e) => {
                          setRepoSearch(e.target.value);
                          setRepoDropdownOpen(true);
                        }}
                        onFocus={() => setRepoDropdownOpen(true)}
                        placeholder={loadingRepos && repos.length === 0 ? 'Loading...' : 'Select repository'}
                        className="flex-1 py-2.5 pr-8 pl-1 text-sm text-slate-800 dark:text-slate-200 bg-transparent border-0 rounded-r-lg focus:ring-0"
                        aria-label="Search or select repository"
                        aria-expanded={repoDropdownOpen}
                        aria-haspopup="listbox"
                      />
                      {loadingRepos && (
                        <span className="material-symbols-outlined text-slate-400 pr-2 animate-spin text-lg">sync</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                        className="p-2 text-slate-400 hover:text-slate-600"
                        aria-label="Toggle repository list"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {repoDropdownOpen ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>
                    {repoDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          aria-hidden="true"
                          onClick={() => setRepoDropdownOpen(false)}
                        />
                        <ul
                          className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg shadow-lg py-1"
                          role="listbox"
                        >
                          {filteredRepos.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-slate-500">No repositories found</li>
                          ) : (
                            filteredRepos.map((r) => {
                              const value = r.id ?? r.path;
                              const label = r.name || r.displayName || r.id || r.path || value;
                              return (
                                <li key={value}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selectedRepo === value}
                                    onClick={() => {
                                      setSelectedRepo(value);
                                      setRepoSearch('');
                                      setRepoDropdownOpen(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                      selectedRepo === value ? 'bg-primary/10 text-primary' : ''
                                    }`}
                                  >
                                    {label}
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* REMOTE: Target device */}
            {environment === 'remote' && (
              <div>
                <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                  Target Device
                </label>
                <select
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-border-dark rounded-lg px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200"
                  aria-label="Select remote device"
                >
                  <option value="">Select a device...</option>
                  {computersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                Task Definition & Instructions
              </label>
              <textarea
                id="task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="e.g. Refactor the authentication middleware to support multi-tenant JWT validation and update the documentation..."
                className="w-full min-h-[140px] bg-slate-50 dark:bg-[#0d0e11] border border-slate-200 dark:border-border-dark rounded-xl p-5 text-slate-900 dark:text-slate-100 text-base resize-y"
                aria-label="Task description"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                Attached Context
              </label>
              <div className="border-2 border-dashed border-slate-200 dark:border-border-dark rounded-xl p-6 flex flex-col items-center justify-center gap-2 min-h-[80px] text-slate-500 dark:text-slate-400 text-sm">
                <span className="material-symbols-outlined text-2xl">upload_file</span>
                <span>Upload or add context (optional)</span>
                <button type="button" className="text-primary text-xs font-medium hover:underline">
                  Add More
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-border-dark flex items-center justify-between bg-slate-50 dark:bg-[#16181d]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPr}
              onChange={(e) => setAutoPr(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-primary focus:ring-0"
            />
            <span className="text-xs font-semibold text-slate-400">Auto-commit changes</span>
          </label>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!selectedService || !prompt.trim() || creating || (environment === 'remote' && !targetDeviceId)}
            >
              {creating ? <span className="material-symbols-outlined text-sm animate-spin">sync</span> : null}
              <span className="material-symbols-outlined text-lg">rocket_launch</span>
              Initialize Agent
            </Button>
          </div>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-2 text-xs technical-font font-bold z-[100] bg-red-500/20 border border-red-500 text-red-400 rounded-lg">
          {toast}
        </div>
      )}
    </Modal>
  );
}
