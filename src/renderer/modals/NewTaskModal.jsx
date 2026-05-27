import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';
import { useApp } from '../context/AppContext.jsx';
import { getProviderDisplayName } from '../utils/format.js';

const CACHE_KEY_PREFIX = 'rts_repo_cache_';

const CLOUD_PROVIDERS = ['jules', 'cursor', 'codex', 'claude-cloud'];
const LOCAL_PROVIDERS = ['antigravity', 'cursor', 'codex', 'claude-cli', 'opencode'];
const REMOTE_PROVIDERS = ['antigravity', 'claude-cli', 'codex', 'opencode'];

function getCachedRepos(provider) {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(CACHE_KEY_PREFIX + provider)
        : null;
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

function capabilityForProvider(state, provider) {
  if (provider === 'claude-cloud' || provider === 'claude-cli') {
    return state.capabilities?.claude;
  }
  if (provider === 'opencode') {
    return state.capabilities?.opencode;
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

function getRepoValue(repo) {
  return repo?.id ?? repo?.path ?? '';
}

function getRepoLabel(repo) {
  return repo?.displayName || repo?.name || repo?.id || repo?.path || '';
}

export default function NewTaskModal({ open, onClose, api }) {
  const { state, fetchComputers, loadAgents } = useApp();
  const { initialPrompt, presetEnvironment, presetTargetDeviceId, presetPreferredProvider } =
    state.newTask || {};
  const [environment, setEnvironment] = useState(state.newTask?.environment ?? 'cloud');
  const [selectedService, setSelectedService] = useState(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [branch, setBranch] = useState('main');
  const [autoPr, setAutoPr] = useState(true);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const repoListRef = React.useRef(null);

  useEffect(() => {
    if (open && initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    if (!open) return;
    if (presetEnvironment) setEnvironment(presetEnvironment);
    if (presetTargetDeviceId) setTargetDeviceId(presetTargetDeviceId);
    if (presetEnvironment === 'remote' && presetPreferredProvider) {
      setSelectedService({ provider: presetPreferredProvider });
    }
  }, [open, presetEnvironment, presetTargetDeviceId, presetPreferredProvider]);

  useEffect(() => {
    if (!open) return;

    let recognition = null;
    if (
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
    ) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let newTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            newTranscript += event.results[i][0].transcript;
          }
        }
        if (newTranscript) {
          setPrompt((prev) => `${prev.trim().length > 0 ? `${prev} ` : ''}${newTranscript.trim()}`);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setToast(
          event.error === 'not-allowed' ? 'Microphone access denied' : 'Speech recognition failed'
        );
        setIsRecording(false);
      };

      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
    }

    return () => {
      recognition?.abort();
      setIsRecording(false);
    };
  }, [open]);

  const agentsForEnv = useMemo(
    () => getAgentsForEnvironment(state, environment),
    [state.capabilities, environment]
  );
  const filteredAgents = useMemo(() => {
    if (!agentFilter.trim()) return agentsForEnv;
    const q = agentFilter.trim().toLowerCase();
    return agentsForEnv.filter((id) => getProviderDisplayName(id).toLowerCase().includes(q));
  }, [agentsForEnv, agentFilter]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.trim().toLowerCase();
    return repos.filter((r) => getRepoLabel(r).toLowerCase().includes(q));
  }, [repos, repoSearch]);

  const selectedRepoDisplay = useMemo(() => {
    if (!selectedRepo) return '';
    const repo = repos.find((x) => getRepoValue(x) === selectedRepo);
    return repo ? getRepoLabel(repo) : selectedRepo;
  }, [repos, selectedRepo]);

  const selectedProvider = selectedService?.provider;
  const repoRequired =
    !!selectedProvider &&
    selectedProvider !== 'claude-cloud' &&
    (environment !== 'cloud' || ['jules', 'cursor'].includes(selectedProvider));
  const showRepoSection = !!selectedProvider && selectedProvider !== 'claude-cloud';
  const computersList = state.computers?.list ?? [];

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (repoDropdownOpen) {
      setHighlightedIndex(-1);
    }
  }, [repoDropdownOpen, repoSearch]);

  useEffect(() => {
    if (highlightedIndex >= 0 && repoListRef.current) {
      repoListRef.current.children[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    if (open && environment === 'remote' && fetchComputers) fetchComputers();
  }, [open, environment, fetchComputers]);

  useEffect(() => {
    if (!open) return;
    const stillValid = selectedService && agentsForEnv.includes(selectedService.provider);
    if (!stillValid) {
      setSelectedService(null);
      setSelectedRepo('');
      setRepos([]);
    }
  }, [environment, agentsForEnv, open]);

  useEffect(() => {
    const provider = selectedService?.provider;
    if (!provider || !api?.getRepositories || provider === 'claude-cloud') return;

    const cached = getCachedRepos(provider);
    if (cached.length > 0) {
      setRepos(cached);
      setSelectedRepo((prev) => {
        if (prev && cached.some((r) => getRepoValue(r) === prev)) return prev;
        return getRepoValue(cached[0]);
      });
    } else {
      setRepos([]);
      setSelectedRepo('');
    }

    setLoadingRepos(true);
    api
      .getRepositories(provider)
      .then((result) => {
        const list =
          result?.success && Array.isArray(result.repositories) ? result.repositories : [];
        setRepos(list);
        setCachedRepos(provider, list);
        setSelectedRepo((prev) => {
          if (list.length === 0) return '';
          if (prev && list.some((r) => getRepoValue(r) === prev)) return prev;
          return getRepoValue(list[0]);
        });
      })
      .catch(() => {
        // Keep cached list if any.
      })
      .finally(() => setLoadingRepos(false));
  }, [selectedService?.provider, api]);

  const validate = () => {
    const errors = {};
    if (!selectedProvider) errors.agent = 'Choose an agent before creating the task.';
    if (!prompt.trim()) errors.prompt = 'Describe what the agent should do.';
    if (environment === 'remote' && !targetDeviceId)
      errors.device = 'Choose the device that should run this queued task.';
    if (repoRequired && !selectedRepo)
      errors.repo = 'Choose the repository or local project path for this task.';
    return errors;
  };

  const currentErrors = submitAttempted ? fieldErrors : {};
  const disabledReason = (() => {
    const errors = validate();
    return errors.agent || errors.device || errors.repo || errors.prompt || '';
  })();

  const handleEnvironmentChange = (env) => {
    setEnvironment(env);
    setSelectedService(null);
    setSelectedRepo('');
    setRepos([]);
    setFieldErrors({});
  };

  const handleRepoKeyDown = (e) => {
    if (!repoDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setRepoDropdownOpen(true);
      return;
    }
    if (filteredRepos.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredRepos.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? filteredRepos.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredRepos.length) {
        const repo = filteredRepos[highlightedIndex];
        setSelectedRepo(getRepoValue(repo));
        setRepoSearch('');
        setRepoDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRepoDropdownOpen(false);
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2, 11),
            file,
            dataUrl: ev.target.result,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (!items[i].type.includes('image')) continue;
      e.preventDefault();
      const file = items[i].getAsFile();
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2, 11),
            file,
            dataUrl: ev.target.result,
            name: 'Pasted image',
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setToast('Speech recognition is not supported in this browser.');
      return;
    }
    if (isRecording) recognitionRef.current.stop();
    else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Failed to start recording:', err);
      }
    }
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setToast(Object.values(errors)[0]);
      return;
    }
    if (!api?.createTask) return;

    const isRemote = environment === 'remote' && targetDeviceId;
    setCreating(true);
    try {
      const options = {
        prompt: prompt.trim(),
        branch: branch || 'main',
        autoCreatePr: autoPr,
        attachments: attachments.map((a) => ({ dataUrl: a.dataUrl })),
      };
      if (selectedRepo) {
        options.repository = selectedRepo;
        if (isRemote) options.projectPath = selectedRepo;
      }
      if (isRemote) options.targetDeviceId = targetDeviceId;

      const result = await api.createTask(selectedProvider, options);
      if (result?.success !== false && loadAgents) {
        loadAgents(false);
      }
      setPrompt('');
      setSelectedService(null);
      setSelectedRepo('');
      setTargetDeviceId('');
      setAttachments([]);
      setFieldErrors({});
      setSubmitAttempted(false);
      onClose();
    } catch (err) {
      console.error(err);
      setToast(err?.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div
        id="new-task-modal"
        className="relative flex h-[88vh] w-[92vw] min-h-0 max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-border-dark dark:bg-sidebar-dark"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-border-dark dark:bg-card-dark">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/20 p-2">
              <span className="material-symbols-outlined text-primary">bolt</span>
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight text-slate-900 dark:text-white">
                Create Agent Task
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Choose where it runs, then give the agent clear instructions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[380px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-b border-slate-200 p-6 dark:border-border-dark lg:border-b-0 lg:border-r">
            <div className="space-y-6">
              <section>
                <div className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  1. Run location
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cloud', label: 'Cloud', icon: 'cloud' },
                    { id: 'local', label: 'Local', icon: 'computer' },
                    { id: 'remote', label: 'Remote', icon: 'dns' },
                  ].map(({ id, label, icon }) => (
                    <button
                      id={`environment-${id}`}
                      key={id}
                      type="button"
                      onClick={() => handleEnvironmentChange(id)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                        environment === id
                          ? 'border-primary bg-primary/15 text-slate-900 dark:text-white'
                          : 'border-slate-200 text-slate-600 hover:border-primary dark:border-border-dark dark:text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    2. Agent
                  </label>
                  {currentErrors.agent && (
                    <span className="text-xs text-red-600 dark:text-red-300">
                      {currentErrors.agent}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  placeholder="Filter agents"
                  className="mb-2 w-full"
                  aria-label="Filter agents"
                />
                <div
                  className={`max-h-48 overflow-y-auto rounded-lg border divide-y divide-slate-200 dark:divide-border-dark ${currentErrors.agent ? 'border-red-400' : 'border-slate-200 dark:border-border-dark'}`}
                >
                  {filteredAgents.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-500">
                      No agents are available for this run location.
                    </div>
                  ) : (
                    filteredAgents.map((id) => {
                      const isSelected = selectedProvider === id;
                      return (
                        <button
                          id={`service-${id}`}
                          key={id}
                          type="button"
                          onClick={() => {
                            setSelectedService({ provider: id });
                            setFieldErrors((prev) => ({ ...prev, agent: null }));
                          }}
                          className={`w-full border px-3 py-2.5 text-left text-sm transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-slate-900 dark:text-white'
                              : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/50'
                          }`}
                          aria-pressed={isSelected}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={`h-2 w-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-slate-400'}`}
                              aria-hidden
                            />
                            <span className="flex-1">{getProviderDisplayName(id)}</span>
                            <span className="material-symbols-outlined text-lg text-slate-400">
                              {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              {environment === 'remote' && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      3. Device
                    </label>
                    {currentErrors.device && (
                      <span className="text-xs text-red-600 dark:text-red-300">
                        {currentErrors.device}
                      </span>
                    )}
                  </div>
                  <select
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className={`w-full ${currentErrors.device ? 'border-red-400' : ''}`}
                    aria-label="Select remote device"
                  >
                    <option value="">Select a device...</option>
                    {computersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id === state.localDeviceId
                          ? `${c.name || c.id} (this device)`
                          : c.name || c.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Remote tasks are queued in Cloudflare KV and run when the selected machine is
                    online.
                  </p>
                </section>
              )}

              {showRepoSection && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {environment === 'local' ? '3. Project path' : 'Repository'}
                      {repoRequired ? '' : ' (optional)'}
                    </label>
                    {currentErrors.repo && (
                      <span className="text-xs text-red-600 dark:text-red-300">
                        {currentErrors.repo}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div
                      className={`flex items-center rounded-lg border bg-white dark:bg-slate-900 ${currentErrors.repo ? 'border-red-400' : 'border-slate-200 dark:border-border-dark'}`}
                    >
                      <input
                        id="task-repo-search"
                        type="text"
                        value={repoDropdownOpen ? repoSearch : selectedRepoDisplay}
                        onChange={(e) => {
                          setRepoSearch(e.target.value);
                          setRepoDropdownOpen(true);
                        }}
                        onFocus={() => setRepoDropdownOpen(true)}
                        onKeyDown={handleRepoKeyDown}
                        placeholder={
                          loadingRepos && repos.length === 0
                            ? 'Loading...'
                            : 'Select repository or path'
                        }
                        className="flex-1 border-0 bg-transparent focus:ring-0"
                        aria-label="Search or select repository"
                        aria-expanded={repoDropdownOpen}
                        aria-haspopup="listbox"
                        aria-activedescendant={
                          highlightedIndex >= 0 ? `repo-option-${highlightedIndex}` : undefined
                        }
                      />
                      {loadingRepos && (
                        <span className="material-symbols-outlined animate-spin px-1 text-lg text-slate-400">
                          sync
                        </span>
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
                          id="repo-dropdown"
                          ref={repoListRef}
                          className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-border-dark dark:bg-slate-900"
                          role="listbox"
                        >
                          {filteredRepos.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-slate-500">
                              No repositories found
                            </li>
                          ) : (
                            filteredRepos.map((repo, index) => {
                              const value = getRepoValue(repo);
                              const label = getRepoLabel(repo);
                              const isHighlighted = index === highlightedIndex;
                              const isSelected = selectedRepo === value;
                              return (
                                <li key={value} id={`repo-option-${index}`}>
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => {
                                      setSelectedRepo(value);
                                      setRepoSearch('');
                                      setRepoDropdownOpen(false);
                                      setFieldErrors((prev) => ({ ...prev, repo: null }));
                                    }}
                                    className={`repo-option w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                      isHighlighted ? 'active-repo-option bg-primary/10' : ''
                                    } ${isSelected ? 'font-medium text-primary' : 'text-slate-700 dark:text-slate-200'}`}
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
                </section>
              )}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col overflow-y-auto p-6">
            <div className="grid gap-5">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Instructions
                  </label>
                  {currentErrors.prompt && (
                    <span className="text-xs text-red-600 dark:text-red-300">
                      {currentErrors.prompt}
                    </span>
                  )}
                </div>
                <div
                  className={`rounded-lg border bg-slate-50 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 dark:bg-[#0d0e11] ${currentErrors.prompt ? 'border-red-400' : 'border-slate-200 dark:border-border-dark'}`}
                >
                  <textarea
                    id="task-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Describe the task, expected output, and any constraints."
                    className="min-h-[260px] w-full resize-none border-0 bg-transparent p-5 font-sans text-sm text-slate-900 focus:ring-0 dark:text-slate-100"
                    aria-label="Task description"
                  />
                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-border-dark">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <span className="material-symbols-outlined text-lg">attach_file</span>
                      Add images
                    </button>
                    <button
                      type="button"
                      onClick={toggleRecording}
                      className={`inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all ${
                        isRecording
                          ? 'bg-red-500 text-white'
                          : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">
                        {isRecording ? 'stop_circle' : 'mic'}
                      </span>
                      {isRecording ? 'Recording' : 'Dictate'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="task-branch"
                    className="mb-2 block text-xs font-semibold text-slate-500 dark:text-slate-400"
                  >
                    Branch or ref
                  </label>
                  <input
                    id="task-branch"
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-border-dark">
                  <input
                    type="checkbox"
                    checked={autoPr}
                    onChange={(e) => setAutoPr(e.target.checked)}
                    className="rounded border-slate-400 text-primary focus:ring-primary"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-white">
                      Auto-create PR when supported
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Provider capabilities decide whether a PR can be opened.
                    </span>
                  </span>
                </label>
              </section>

              <section>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Attached context
                </div>
                {attachments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-border-dark dark:text-slate-400">
                    Attach screenshots or paste images into the instructions box when they help
                    explain the task.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-border-dark"
                      >
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttachment(att.id)}
                          className="absolute right-0 top-0 rounded-bl bg-red-500 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <span className="material-symbols-outlined block text-sm">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </main>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-border-dark dark:bg-card-dark">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {disabledReason || 'Ready to create the task.'}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              id="create-task-btn"
              variant="primary"
              onClick={handleSubmit}
              disabled={!!disabledReason || creating}
              className="inline-flex items-center gap-2"
            >
              {creating ? (
                <span className="material-symbols-outlined animate-spin text-sm">sync</span>
              ) : null}
              <span>Create Task</span>
              <span className="material-symbols-outlined text-lg">send</span>
            </Button>
          </div>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-[100] rounded-lg border border-red-500 bg-red-500/20 px-4 py-2 text-xs font-bold text-red-600 dark:text-red-300">
          {toast}
        </div>
      )}
    </Modal>
  );
}
