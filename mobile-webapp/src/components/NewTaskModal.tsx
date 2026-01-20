/**
 * New Task Modal Component
 * 
 * Modal for creating new tasks on cloud providers or remote computers
 */

import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import type { Provider, Repository } from '../store/types';

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
      setLoadingRepos(true);
      setRepositories([]);
      setSelectedRepo('');
      
      getRepositories(selectedService)
        .then(repos => {
          setRepositories(repos);
          if (repos.length > 0) {
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

        // Find tool to use based on device capabilities (services list preferred).
        const services = Array.isArray(device.services)
          ? device.services
          : [
              ...(device.tools?.gemini ? ['gemini'] : []),
              ...(device.tools?.['claude-cli'] ? ['claude'] : []),
            ];

        // Remote queue currently supports Gemini + Claude CLI.
        let tool = 'gemini'; // Default to gemini for remote devices
        if (services.includes('claude')) tool = 'claude-cli';
        else if (services.includes('gemini')) tool = 'gemini';

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
      <header className="h-14 flex items-center justify-between px-4 border-b border-border-dark bg-sidebar-dark safe-top">
        <button
          onClick={handleClose}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <h2 className="font-display text-sm font-bold uppercase tracking-tight">New Task</h2>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || creating}
          className="bg-primary text-black px-4 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </header>

      {/* Content */}
      <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-6 safe-bottom">
        {/* Error */}
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500/50">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-red-400 text-sm">error</span>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Target Device */}
        {configuredServices.cloudflare && onlineComputers.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 border border-primary text-[10px] font-display text-primary">01</span>
              <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Target Device</h3>
            </div>

            <select
              value={targetDevice}
              onChange={(e) => {
                setTargetDevice(e.target.value);
                if (e.target.value !== 'local') {
                  setSelectedService(null);
                }
              }}
              className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
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
              <span className="flex items-center justify-center w-5 h-5 border border-primary text-[10px] font-display text-primary">
                {configuredServices.cloudflare && onlineComputers.length > 0 ? '02' : '01'}
              </span>
              <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Choose Service</h3>
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
                      className={`text-left p-3 border transition-colors ${
                        isSelected
                          ? `${service.color} bg-white/5`
                          : isConfigured
                          ? 'border-border-dark hover:border-slate-600'
                          : 'border-border-dark opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg mb-1 ${isSelected ? '' : 'text-slate-400'}`}>
                        {service.icon}
                      </span>
                      <div className={`font-display text-[10px] font-bold uppercase ${isSelected ? '' : 'text-slate-300'}`}>
                        {service.name}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">{service.description}</div>
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
              <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-[10px] font-display text-slate-400">
                {configuredServices.cloudflare && onlineComputers.length > 0 ? '03' : '02'}
              </span>
              <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Repository</h3>
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
                  className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
                >
                  {repositories.map(repo => (
                    <option key={repo.id} value={repo.id}>{repo.displayName}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-black border border-border-dark text-sm py-2.5 px-3 text-slate-300 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                      Auto PR
                    </label>
                    <label className="flex items-center gap-2 h-[38px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreatePr}
                        onChange={(e) => setAutoCreatePr(e.target.checked)}
                        className="w-4 h-4 bg-transparent border-primary text-primary focus:ring-0"
                      />
                      <span className="text-xs text-slate-400">Enabled</span>
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
              <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-[10px] font-display text-slate-400">02</span>
              <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Repository</h3>
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
                  className="w-full bg-black border border-border-dark text-sm py-3 px-3 text-slate-300 font-display text-xs focus:outline-none focus:border-primary"
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
            <span className="flex items-center justify-center w-5 h-5 border border-slate-600 text-[10px] font-display text-slate-400">
              {(() => {
                let step = 2;
                if (configuredServices.cloudflare && onlineComputers.length > 0) step++;
                if ((selectedService === 'jules' || selectedService === 'cursor') && targetDevice === 'local') step++;
                if (targetDevice !== 'local') step++;
                return step.toString().padStart(2, '0');
              })()}
            </span>
            <h3 className="font-display text-xs font-bold text-slate-300 uppercase tracking-wider">Task Description</h3>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want the AI agent to do..."
            rows={6}
            className="w-full bg-black border border-border-dark text-sm p-3 text-slate-300 focus:outline-none focus:border-primary resize-none"
          />
        </div>
      </div>
    </div>
  );
}
