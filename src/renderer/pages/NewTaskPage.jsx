import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { useApp } from '../context/AppContext.jsx';
import Composer from '../components/chat/Composer.jsx';
import { getProviderDisplayName } from '../utils/format.js';
import { getLastSelectedModel, setLastSelectedModel } from '../utils/last-selected-model.js';
import { providerMeta, IconChevronDown } from '../components/ui/icons.jsx';

const CACHE_KEY_PREFIX = 'rts_repo_cache_';
const MODELS_CACHE_KEY_PREFIX = 'rts_model_cache_';

const CLOUD_PROVIDERS = ['jules', 'cursor', 'claude-cloud'];
const LOCAL_PROVIDERS = ['antigravity', 'cursor', 'codex', 'claude-cli', 'opencode'];
const REMOTE_PROVIDERS = ['antigravity', 'claude-cli', 'codex', 'opencode'];

function getCachedModels(provider) {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(MODELS_CACHE_KEY_PREFIX + provider) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCachedModels(provider, models) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODELS_CACHE_KEY_PREFIX + provider, JSON.stringify(models));
    }
  } catch {
    // Ignore storage failures; the in-session cache still applies.
  }
}

function getCachedRepos(provider) {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY_PREFIX + provider) : null;
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
    // Ignore storage failures; the in-session cache still applies.
  }
}

function capabilityForProvider(state, provider) {
  if (provider === 'claude-cloud' || provider === 'claude-cli') return state.capabilities?.claude;
  if (provider === 'opencode') return state.capabilities?.opencode;
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
  return repo?.path ?? repo?.id ?? '';
}

function getRepoLabel(repo) {
  return repo?.displayName || repo?.name || repo?.id || repo?.path || '';
}

function shortRepo(repository) {
  const text = String(repository || '').trim();
  if (!text) return '';
  return text.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || text;
}

function looksLikeLocalPath(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^[A-Za-z]:[\\/]/.test(text)) return true;
  if (text.startsWith('/') || text.startsWith('\\\\')) return true;
  return false;
}

function ControlPill({ label, value, onClick, id }) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      className="inline-flex max-w-[180px] items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
    >
      <span className="min-w-0 truncate">{value || label}</span>
      <IconChevronDown size={12} className="shrink-0 opacity-70" />
    </button>
  );
}

/**
 * New Task tab: a tight top-aligned location/agent strip plus a Composer
 * whose footer pills carry repo, device, model, branch, and auto-PR
 * (DESIGN.md §5 — power controls as composer pills).
 */
export default function NewTaskPage() {
  const { state, api, fetchComputers, loadAgents } = useApp();
  const { initialPrompt, presetEnvironment, presetTargetDeviceId, presetPreferredProvider } =
    state.newTask || {};

  const [environment, setEnvironment] = useState(
    presetEnvironment || state.newTask?.environment || 'cloud'
  );
  const [selectedProvider, setSelectedProvider] = useState(
    presetPreferredProvider && presetEnvironment === 'remote' ? presetPreferredProvider : null
  );
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [repoSearch, setSelectedRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelHighlightedIndex, setModelHighlightedIndex] = useState(-1);
  const [prompt, setPrompt] = useState('');
  const [branch, setBranch] = useState('main');
  const [autoPr, setAutoPr] = useState(true);
  const [creating, setCreating] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState(presetTargetDeviceId || '');
  const [attachments, setAttachments] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const repoInputContainerRef = useRef(null);
  const repoListRef = useRef(null);
  const modelInputContainerRef = useRef(null);
  const modelListRef = useRef(null);
  const [repoDropdownPos, setRepoDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [modelDropdownPos, setModelDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const agentsForEnv = useMemo(
    () => getAgentsForEnvironment(state, environment),
    [state.capabilities, environment]
  );

  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.trim().toLowerCase();
    return repos.filter((r) => getRepoLabel(r).toLowerCase().includes(q));
  }, [repos, repoSearch]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return models;
    const q = modelSearch.trim().toLowerCase();
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, modelSearch]);

  const selectedRepoDisplay = useMemo(() => {
    if (!selectedRepo) return '';
    const repo = repos.find((x) => getRepoValue(x) === selectedRepo);
    return repo ? getRepoLabel(repo) : selectedRepo;
  }, [repos, selectedRepo]);

  const repoRequired =
    !!selectedProvider &&
    selectedProvider !== 'claude-cloud' &&
    (environment !== 'cloud' || ['jules', 'cursor'].includes(selectedProvider));
  const showRepoSection = !!selectedProvider && selectedProvider !== 'claude-cloud';
  const showModelPill = !!selectedProvider && (models.length > 0 || selectedModel);
  const computersList = state.computers?.list ?? [];

  useEffect(() => {
    if (environment === 'remote' && fetchComputers) fetchComputers();
  }, [environment, fetchComputers]);

  useEffect(() => {
    const stillValid = selectedProvider && agentsForEnv.includes(selectedProvider);
    if (!stillValid && !presetPreferredProvider) {
      setSelectedProvider(null);
      setSelectedRepo('');
      setRepos([]);
    }
  }, [environment, agentsForEnv]);

  useEffect(() => {
    if (!selectedProvider || !api?.getRepositories || selectedProvider === 'claude-cloud') return;

    const cached = getCachedRepos(selectedProvider);
    if (cached.length > 0) {
      setRepos(cached);
      setSelectedRepo((prev) =>
        prev && cached.some((r) => getRepoValue(r) === prev) ? prev : getRepoValue(cached[0])
      );
    } else {
      setRepos([]);
      setSelectedRepo('');
    }

    setLoadingRepos(true);
    api
      .getRepositories(selectedProvider)
      .then((result) => {
        const list = result?.success && Array.isArray(result.repositories) ? result.repositories : [];
        setRepos(list);
        setCachedRepos(selectedProvider, list);
        setSelectedRepo((prev) => {
          if (list.length === 0) return '';
          if (prev && list.some((r) => getRepoValue(r) === prev)) return prev;
          return getRepoValue(list[0]);
        });
      })
      .catch(() => {
        // Keep the cached list if any.
      })
      .finally(() => setLoadingRepos(false));
  }, [selectedProvider, api]);

  useEffect(() => {
    if (!selectedProvider || !api?.getProviderModels) {
      setSelectedModel('');
      setModels([]);
      return;
    }

    const lastModel = getLastSelectedModel(selectedProvider);
    setSelectedModel(lastModel);
    setModels(getCachedModels(selectedProvider));

    let cancelled = false;
    api
      .getProviderModels(selectedProvider)
      .then((result) => {
        if (cancelled) return;
        const list = Array.isArray(result?.models) ? result.models : [];
        setModels(list);
        setCachedModels(selectedProvider, list);
        setSelectedModel((prev) => {
          if (prev && (list.length === 0 || list.includes(prev))) return prev;
          const remembered = getLastSelectedModel(selectedProvider);
          if (remembered && (list.includes(remembered) || list.length === 0)) return remembered;
          return prev && list.includes(prev) ? prev : '';
        });
      })
      .catch(() => {
        // Keep the cached list / remembered model if any.
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, api]);

  useEffect(() => {
    if (repoDropdownOpen && repoInputContainerRef.current) {
      const rect = repoInputContainerRef.current.getBoundingClientRect();
      setRepoDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      });
      setHighlightedIndex(-1);
    }
  }, [repoDropdownOpen]);

  useEffect(() => {
    if (modelDropdownOpen && modelInputContainerRef.current) {
      const rect = modelInputContainerRef.current.getBoundingClientRect();
      setModelDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      setModelHighlightedIndex(-1);
    }
  }, [modelDropdownOpen]);

  useEffect(() => {
    if (highlightedIndex >= 0 && repoListRef.current) {
      repoListRef.current.children[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    if (modelHighlightedIndex >= 0 && modelListRef.current) {
      modelListRef.current.children[modelHighlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [modelHighlightedIndex]);

  const chooseModel = (model) => {
    setSelectedModel(model);
    setModelSearch('');
    setModelDropdownOpen(false);
    if (selectedProvider) setLastSelectedModel(selectedProvider, model);
  };

  const commitTypedRepoPath = (raw) => {
    const text = String(raw || '').trim();
    if (!looksLikeLocalPath(text)) return false;
    setSelectedRepo(text);
    setSelectedRepoSearch('');
    setRepoDropdownOpen(false);
    setFieldErrors((prev) => ({ ...prev, repo: null }));
    return true;
  };

  const handleRepoKeyDown = (e) => {
    if (!repoDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setRepoDropdownOpen(true);
      if (e.key === 'Enter' && commitTypedRepoPath(repoSearch || selectedRepo)) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredRepos.length) {
        const repo = filteredRepos[highlightedIndex];
        setSelectedRepo(getRepoValue(repo));
        setSelectedRepoSearch('');
        setRepoDropdownOpen(false);
        return;
      }
      if (commitTypedRepoPath(repoSearch)) return;
      return;
    }
    if (filteredRepos.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setRepoDropdownOpen(false);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredRepos.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? filteredRepos.length - 1 : prev - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRepoDropdownOpen(false);
    }
  };

  const handleModelKeyDown = (e) => {
    if (!modelDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setModelDropdownOpen(true);
      }
      return;
    }
    if (filteredModels.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setModelHighlightedIndex((prev) => (prev + 1) % filteredModels.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setModelHighlightedIndex((prev) => (prev <= 0 ? filteredModels.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (modelHighlightedIndex >= 0 && modelHighlightedIndex < filteredModels.length) {
        chooseModel(filteredModels[modelHighlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setModelDropdownOpen(false);
    }
  };

  const handleFiles = (files) => {
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2, 11), file, dataUrl: ev.target.result, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
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
          { id: Math.random().toString(36).slice(2, 11), file, dataUrl: ev.target.result, name: 'Pasted image' },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const resolvedRepoPath = selectedRepo || (looksLikeLocalPath(repoSearch) ? repoSearch.trim() : '');

  const validate = () => {
    const errors = {};
    if (!selectedProvider) errors.agent = 'Choose an agent before creating the task.';
    if (!prompt.trim()) errors.prompt = 'Describe what the agent should do.';
    if (environment === 'remote' && !targetDeviceId) errors.device = 'Choose the device that should run this queued task.';
    if (repoRequired && !resolvedRepoPath) errors.repo = 'Choose the repository or local project path for this task.';
    return errors;
  };

  const currentErrors = submitAttempted ? fieldErrors : {};

  const handleSubmit = () => {
    setSubmitAttempted(true);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      sonnerToast.error(Object.values(errors)[0]);
      return;
    }
    if (!api?.createTask || creating) return;

    const isRemote = environment === 'remote' && targetDeviceId;
    const options = {
      prompt: prompt.trim(),
      branch: branch || 'main',
      autoCreatePr: autoPr,
      attachments: attachments.map((a) => ({ dataUrl: a.dataUrl })),
    };
    if (resolvedRepoPath) {
      options.repository = resolvedRepoPath;
      options.projectPath = resolvedRepoPath;
    }
    if (isRemote) options.targetDeviceId = targetDeviceId;
    if (selectedModel) options.model = selectedModel;
    if (selectedProvider) setLastSelectedModel(selectedProvider, selectedModel || '');

    setCreating(true);

    const providerLabel = getProviderDisplayName(selectedProvider);
    // Main-process createTask resolves { success: false, error } rather than rejecting.
    const creation = Promise.resolve(api.createTask(selectedProvider, options)).then((result) => {
      if (result?.success === false) {
        throw new Error(result.error || 'Failed to create task');
      }
      return result;
    });

    sonnerToast.promise(creation, {
      loading: `Starting ${providerLabel} task...`,
      success: () => {
        if (loadAgents) loadAgents({ force: true });
        setPrompt('');
        setSelectedRepo('');
        setSelectedModel('');
        setModels([]);
        setTargetDeviceId('');
        setAttachments([]);
        setFieldErrors({});
        setSubmitAttempted(false);
        return `${providerLabel} task started`;
      },
      error: (err) => err?.message || 'Failed to create task',
      finally: () => setCreating(false),
    });
  };

  return (
    <div id="new-task-modal" className="mx-auto h-full min-h-0 max-w-3xl overflow-y-auto px-4 py-4 md:px-6">
      <div className="space-y-3">
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Run location
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'cloud', label: 'Cloud' },
              { id: 'local', label: 'Local' },
              { id: 'remote', label: 'Remote' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                id={`environment-${id}`}
                onClick={() => {
                  setEnvironment(id);
                  setSelectedProvider(null);
                  setSelectedRepo('');
                  setRepos([]);
                  setFieldErrors({});
                }}
                aria-pressed={environment === id}
                className={`rounded-md border px-3 py-2 text-[13px] font-medium transition-colors ${
                  environment === id
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'border-border-light text-neutral-600 hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {environment === 'remote' && (
            <p className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
              Remote tasks queue in Cloudflare KV and run when the machine is online.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Agent
            {currentErrors.agent && (
              <span className="font-medium normal-case tracking-normal text-red-600 dark:text-red-400">
                {currentErrors.agent}
              </span>
            )}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {agentsForEnv.length === 0 ? (
              <p className="py-1 text-[13px] text-neutral-400">
                No agents are available for this run location. Connect one in Plugins.
              </p>
            ) : (
              agentsForEnv.map((id) => {
                const meta = providerMeta(id);
                const isSelected = selectedProvider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    id={`service-${id}`}
                    onClick={() => {
                      setSelectedProvider(id);
                      setFieldErrors((prev) => ({ ...prev, agent: null }));
                    }}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                        : 'border-border-light text-neutral-600 hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <meta.Icon size={14} className="shrink-0" />
                    <span className="truncate">{getProviderDisplayName(id)}</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {currentErrors.prompt && (
          <p className="text-[12px] text-red-600 dark:text-red-400">{currentErrors.prompt}</p>
        )}
        {(() => {
          const reason = Object.values(validate())[0];
          if (reason) {
            return (
              <p className="text-[12px] text-amber-700 dark:text-amber-400">{reason}</p>
            );
          }
          return null;
        })()}

        <Composer
          value={prompt}
          onChange={(value) => {
            setPrompt(value);
            if (fieldErrors.prompt) setFieldErrors((prev) => ({ ...prev, prompt: null }));
          }}
          onSubmit={handleSubmit}
          busy={creating}
          disabled={creating}
          textareaId="task-prompt"
          submitId="create-task-btn"
          submitLabel="Create task"
          placeholder="Describe the task, expected output, and any constraints…"
          submitOnEnter={false}
          minRows={3}
          maxRows={12}
          attachments={attachments}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onFiles={handleFiles}
          onPaste={handlePaste}
          footerNote={`${
            getProviderDisplayName(selectedProvider) || 'No agent selected'
          } · ${shortRepo(resolvedRepoPath) || (repoRequired ? 'repo required' : 'no repo')}${
            autoPr ? ' · auto-PR on' : ''
          }`}
        >
          {environment === 'remote' && (
            <label
              className={`inline-flex max-w-[200px] items-center gap-1 rounded-md px-1.5 py-1 text-[13px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                currentErrors.device
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              <select
                id="task-device"
                value={targetDeviceId}
                onChange={(e) => {
                  setTargetDeviceId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, device: null }));
                }}
                aria-label="Select remote device"
                className="min-w-[4.5rem] max-w-[140px] cursor-pointer appearance-none border-0 bg-transparent p-0 text-[13px] text-inherit focus:border-transparent focus:outline-none focus:ring-0"
              >
                <option value="">Device</option>
                {computersList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id === state.localDeviceId ? `${c.name || c.id} (this device)` : c.name || c.id}
                  </option>
                ))}
              </select>
              <IconChevronDown size={12} className="pointer-events-none shrink-0 opacity-70" />
            </label>
          )}

          {showRepoSection && (
            <div className="relative" ref={repoInputContainerRef}>
              <label
                className={`inline-flex max-w-[200px] items-center gap-1 rounded-md px-1.5 py-1 text-[13px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  currentErrors.repo
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                <input
                  id="task-repo-search"
                  type="text"
                  value={repoDropdownOpen ? repoSearch : selectedRepoDisplay}
                  onChange={(e) => {
                    setSelectedRepoSearch(e.target.value);
                    setRepoDropdownOpen(true);
                  }}
                  onFocus={() => setRepoDropdownOpen(true)}
                  onKeyDown={handleRepoKeyDown}
                  placeholder={
                    loadingRepos && repos.length === 0
                      ? 'Loading…'
                      : environment === 'local'
                        ? 'Path'
                        : 'Repo'
                  }
                  className="min-w-0 w-28 truncate border-0 bg-transparent p-0 font-mono text-[13px] text-inherit placeholder:text-neutral-400 focus:border-transparent focus:outline-none focus:ring-0 dark:placeholder:text-neutral-500"
                  aria-label="Search or select repository"
                  aria-expanded={repoDropdownOpen}
                  aria-haspopup="listbox"
                />
                <button
                  type="button"
                  onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                  aria-label="Toggle repository list"
                  className="shrink-0 text-current opacity-70 hover:opacity-100"
                >
                  <IconChevronDown size={12} />
                </button>
              </label>
              {repoDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden="true"
                    onClick={() => {
                      setRepoDropdownOpen(false);
                      setSelectedRepoSearch('');
                    }}
                  />
                  <ul
                    id="repo-dropdown"
                    ref={repoListRef}
                    className="fixed z-20 max-h-48 overflow-y-auto rounded-md border border-border-light bg-card-light py-1 dark:border-border-dark dark:bg-card-dark"
                    role="listbox"
                    style={{ top: repoDropdownPos.top, left: repoDropdownPos.left, width: repoDropdownPos.width }}
                  >
                    {filteredRepos.length === 0 ? (
                      <li className="px-3 py-2 text-[13px] text-neutral-400">No repositories found</li>
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
                                setSelectedRepoSearch('');
                                setRepoDropdownOpen(false);
                                setFieldErrors((prev) => ({ ...prev, repo: null }));
                              }}
                              className={`repo-option w-full px-3 py-2 text-left font-mono text-[12px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                                isHighlighted ? 'active-repo-option bg-neutral-100 dark:bg-neutral-800' : ''
                              } ${isSelected ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'}`}
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

          {showModelPill && (
            <div className="relative" ref={modelInputContainerRef}>
              <ControlPill
                id="task-model"
                label="Model"
                value={selectedModel || 'default'}
                onClick={() => setModelDropdownOpen((v) => !v)}
              />
              {modelDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden="true"
                    onClick={() => {
                      setModelDropdownOpen(false);
                      setModelSearch('');
                    }}
                  />
                  <ul
                    id="model-dropdown"
                    ref={modelListRef}
                    className="fixed z-20 max-h-48 w-56 overflow-y-auto rounded-md border border-border-light bg-card-light py-1 dark:border-border-dark dark:bg-card-dark"
                    role="listbox"
                    style={{ top: modelDropdownPos.top, left: modelDropdownPos.left }}
                  >
                    <li className="border-b border-border-light px-2 py-1.5 dark:border-border-dark">
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        onKeyDown={handleModelKeyDown}
                        placeholder="Search models"
                        aria-label="Search models"
                        className="w-full border-0 bg-transparent px-1 text-[12px] focus:ring-0"
                      />
                    </li>
                    <li>
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedModel}
                        onClick={() => chooseModel('')}
                        className={`w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                          !selectedModel ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        Harness default
                      </button>
                    </li>
                    {filteredModels.map((m, index) => (
                      <li key={m} id={`model-option-${index}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedModel === m}
                          onClick={() => chooseModel(m)}
                          className={`w-full truncate px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                            index === modelHighlightedIndex ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                          } ${selectedModel === m ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'}`}
                        >
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <label
            htmlFor="task-branch"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
          >
            <input
              id="task-branch"
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              aria-label="Branch or ref"
              className="w-20 border-0 bg-transparent px-0 py-0 font-mono text-[13px] focus:ring-0"
            />
          </label>

          <button
            type="button"
            onClick={() => setAutoPr((v) => !v)}
            aria-pressed={autoPr}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            Auto-PR {autoPr ? 'on' : 'off'}
          </button>
        </Composer>
      </div>
    </div>
  );
}
