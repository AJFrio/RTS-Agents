/**
 * New Task Modal Component
 * 
 * Modal for creating new tasks on cloud providers or remote computers
 */

import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import type { Provider, Repository } from '../store/types';
import { hasTool } from '../utils/tools';

interface ServiceOption {
  id: Provider;
  name: string;
  icon: string;
  description: string;
  color: string;
}

const services: ServiceOption[] = [
  { id: 'jules', name: 'Jules', icon: 'code', description: 'GitHub repos via Jules API', color: 'border-primary text-primary' },
  { id: 'cursor', name: 'Cursor', icon: 'near_me', description: 'Cloud-based via Cursor API', color: 'border-blue-500 text-blue-500' },
  { id: 'codex', name: 'Codex', icon: 'psychology', description: 'Cloud tasks via OpenAI', color: 'border-cyan-500 text-cyan-500' },
  { id: 'claude-cloud', name: 'Claude', icon: 'cloud', description: 'Anthropic API', color: 'border-amber-500 text-amber-500' },
];

export default function NewTaskModal() {
  const { state, dispatch, createTask, getRepositories, loadComputers, dispatchRemoteTask } = useApp();
  const { showNewTaskModal, configuredServices, computers } = state;

  const [selectedService, setSelectedService] = useState<Provider | null>(null);
  const [targetDevice, setTargetDevice] = useState<'local' | string>('local'); // 'local' or device ID
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [branch, setBranch] = useState('main');
  const [prompt, setPrompt] = useState('');
  const [autoCreatePr, setAutoCreatePr] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load computers on mount
  useEffect(() => {
    if (showNewTaskModal && configuredServices.cloudflare) {
      loadComputers();
    }
  }, [showNewTaskModal, configuredServices.cloudflare, loadComputers]);

  // Load repositories when service is selected
  useEffect(() => {
    if (selectedService && (selectedService === 'jules' || selectedService === 'cursor')) {
      const cacheKey = `rts_repo_cache_${selectedService}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setRepositories(parsed);
          if (parsed.length > 0) {
            setSelectedRepo(parsed[0].id);
          }
        } catch (e) {
          // Ignore cache errors
        }
      }

      setLoadingRepos(true);
      if (!cached) {
        setRepositories([]);
        setSelectedRepo('');
      }
      
      getRepositories(selectedService)
        .then(repos => {
          setRepositories(repos);
          localStorage.setItem(cacheKey, JSON.stringify(repos));
          // Update selection only if not already set (or valid)
          if (repos.length > 0 && (!selectedRepo || !repos.find(r => r.id === selectedRepo))) {
            setSelectedRepo(repos[0].id);
          }
        })
        .catch(err => {
          setError(`Failed to load repositories: ${err.message}`);
        })
        .finally(() => {
          setLoadingRepos(false);
        });
    }
  }, [selectedService, getRepositories]);

  const handleClose = () => {
    dispatch({ type: 'SET_SHOW_NEW_TASK_MODAL', payload: false });
    // Reset form
    setSelectedService(null);
    setTargetDevice('local');
    setRepositories([]);
    setSelectedRepo('');
    setBranch('main');
    setPrompt('');
    setAutoCreatePr(true);
    setError(null);
  };

  const handleServiceSelect = (service: Provider) => {
    if (!configuredServices[service === 'claude-cloud' ? 'claude' : service]) {
      setError(`${service} is not configured. Please add your API key in Settings.`);
      return;
    }
    setSelectedService(service);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('Please enter a task description');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // If targeting a remote device, dispatch to that device's queue
      if (targetDevice !== 'local') {
        const device = computers.find(c => c.id === targetDevice);
        if (!device) {
          throw new Error('Selected device not found');
        }

        // Find tool to use based on device capabilities (using new schema)
        let tool = 'gemini'; // Default to gemini for remote devices

        if (hasTool(device, 'claude CLI')) {
          tool = 'claude-cli';
        }

        await dispatchRemoteTask(targetDevice, {
          tool,
          repo: selectedRepo || '',
          prompt: prompt.trim(),
        });

        handleClose();
        return;
      }

      // Otherwise, create task via cloud API
      if (!selectedService) {
        throw new Error('Please select a service');
      }

      await createTask(selectedService, {
        prompt: prompt.trim(),
        repository: selectedRepo,
        branch,
        autoCreatePr,
      });

      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  if (!showNewTaskModal) return null;

  // Filter available services based on configuration
  const availableServices = services.filter(s => {
    const key = s.id === 'claude-cloud' ? 'claude' : s.id;
    return configuredServices[key];
  });

  // Filter online computers
  const onlineComputers = computers.filter(c => c.status === 'on');

  const canSubmit = prompt.trim() && (selectedService || targetDevice !== 'local');

  return (
    <div className="fixed inset-0 z-50 bg-black/90">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border-dark bg-sidebar-dark safe-top shadow-sm">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <h2 className="text-base font-semibold">New Task</h2>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || creating}
          className="bg-primary text-black px-4 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-6 safe-bottom">
        {/* Error */}
        {error && (
          <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl shadow-sm">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400 text-sm">error</span>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Target Device */}
        {configuredServices.cloudflare && onlineComputers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-primary text-xs font-medium text-primary rounded">01</span>
              <h3 className="text-sm font-semibold text-slate-300">Target Device</h3>
            </div>

            <select
              value={targetDevice}
              onChange={(e) => {
                setTargetDevice(e.target.value);
                if (e.target.value !== 'local') {
                  setSelectedService(null);
                }
              }}
              className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
            >
              <option value="local">This Device (Cloud APIs)</option>
              {onlineComputers.map(computer => (
                <option key={computer.id} value={computer.id}>
                  {computer.name} ({computer.platform})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Service Selection (only for local/cloud tasks) */}
        {targetDevice === 'local' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-primary text-xs font-medium text-primary rounded">
                {configuredServices.cloudflare && onlineComputers.length > 0 ? '02' : '01'}
              </span>
              <h3 className="text-sm font-semibold text-slate-300">Choose Service</h3>
            </div>

            {availableServices.length === 0 ? (
              <p className="text-xs text-slate-500">No services configured. Add API keys in Settings.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {services.map(service => {
                  const key = service.id === 'claude-cloud' ? 'claude' : service.id;
                  const isConfigured = configuredServices[key];
                  const isSelected = selectedService === service.id;

                  return (
                    <button
                      key={service.id}
                      onClick={() => handleServiceSelect(service.id)}
                      disabled={!isConfigured}
                      className={`text-left p-4 border rounded-xl transition-all duration-200 ${
                        isSelected
                          ? `${service.color} bg-white/5 shadow-sm`
                          : isConfigured
                          ? 'border-border-dark hover:border-slate-600 hover:shadow-sm'
                          : 'border-border-dark opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg mb-1 ${isSelected ? '' : 'text-slate-400'}`}>
                        {service.icon}
                      </span>
                      <div className={`text-sm font-semibold ${isSelected ? '' : 'text-slate-300'}`}>
                        {service.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{service.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Repository Selection */}
        {(selectedService === 'jules' || selectedService === 'cursor') && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-xs font-medium text-slate-400 rounded">
                {configuredServices.cloudflare && onlineComputers.length > 0 ? '03' : '02'}
              </span>
              <h3 className="text-sm font-semibold text-slate-300">Repository</h3>
            </div>

            {loadingRepos ? (
              <div className="flex items-center gap-2 py-3">
                <span className="material-symbols-outlined text-primary text-sm animate-spin">sync</span>
                <span className="text-xs text-slate-500">Loading repositories...</span>
              </div>
            ) : repositories.length === 0 ? (
              <p className="text-xs text-slate-500">No repositories available</p>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                >
                  {repositories.map(repo => (
                    <option key={repo.id} value={repo.id}>{repo.displayName}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-black border border-border-dark text-sm py-2.5 px-3 text-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Auto PR
                    </label>
                    <label className="flex items-center gap-2 h-[38px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreatePr}
                        onChange={(e) => setAutoCreatePr(e.target.checked)}
                        className="w-4 h-4 bg-transparent border-primary text-primary focus:ring-0 rounded"
                      />
                      <span className="text-sm text-slate-400">Enabled</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Remote Device Repository Selection */}
        {targetDevice !== 'local' && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-xs font-medium text-slate-400 rounded">02</span>
              <h3 className="text-sm font-semibold text-slate-300">Repository</h3>
            </div>

            {(() => {
              const device = computers.find(c => c.id === targetDevice);
              const deviceRepos = device?.repos || [];

              if (deviceRepos.length === 0) {
                return <p className="text-xs text-slate-500">No repositories available on this device</p>;
              }

              return (
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                >
                  <option value="">Select a repository...</option>
                  {deviceRepos.map(repo => (
                    <option key={repo.path} value={repo.path || ''}>{repo.name}</option>
                  ))}
                </select>
              );
            })()}
          </div>
        )}

        {/* Task Description */}
        <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-xs font-medium text-slate-400 rounded">
                {(() => {
                  let step = 2;
                  if (configuredServices.cloudflare && onlineComputers.length > 0) step++;
                  if ((selectedService === 'jules' || selectedService === 'cursor') && targetDevice === 'local') step++;
                  if (targetDevice !== 'local') step++;
                  return step.toString().padStart(2, '0');
                })()}
              </span>
              <h3 className="text-sm font-semibold text-slate-300">Task Description</h3>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want the AI agent to do..."
              rows={6}
              className="w-full bg-black border border-border-dark text-sm p-3 text-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all duration-200"
            />
        </div>
      </div>
    </div>
  );
}
