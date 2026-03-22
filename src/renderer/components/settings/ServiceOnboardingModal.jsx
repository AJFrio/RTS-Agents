import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { SERVICE_CATALOG, getServiceDefinition } from './service-catalog.js';

function getInitialValues(service, state) {
  if (!service) return {};
  if (service.kind === 'jira') {
    return {
      baseUrl: state.settings?.jiraBaseUrl || '',
      apiKey: '',
    };
  }
  if (service.kind === 'cloudflare') {
    return {
      accountId: state.serviceInfo?.cloudflare?.accountId || '',
      apiToken: '',
    };
  }
  return { path: '', apiKey: '' };
}

function getExistingPaths(serviceId, state) {
  switch (serviceId) {
    case 'gemini-local':
      return state.settings?.geminiPaths || [];
    case 'claude-local':
      return state.settings?.claudePaths || [];
    case 'cursor-local':
      return state.settings?.cursorPaths || [];
    case 'codex-local':
      return state.settings?.codexPaths || [];
    case 'github-local':
      return state.settings?.githubPaths || [];
    default:
      return [];
  }
}

function getInstallState(serviceId, state) {
  if (serviceId === 'gemini-local') {
    return state.serviceInfo?.installations?.gemini;
  }
  if (serviceId === 'claude-local') {
    return state.serviceInfo?.installations?.claude;
  }
  return true;
}

async function addPathForService(serviceId, pathValue, api) {
  if (serviceId === 'gemini-local') return api.addGeminiPath(pathValue);
  if (serviceId === 'claude-local') return api.addClaudePath(pathValue);
  if (serviceId === 'cursor-local') return api.addCursorPath(pathValue);
  if (serviceId === 'codex-local') return api.addCodexPath(pathValue);
  if (serviceId === 'github-local') return api.addGithubPath(pathValue);
  throw new Error(`Unsupported local service: ${serviceId}`);
}

async function removePathForService(serviceId, pathValue, api) {
  if (serviceId === 'gemini-local') return api.removeGeminiPath(pathValue);
  if (serviceId === 'claude-local') return api.removeClaudePath(pathValue);
  if (serviceId === 'cursor-local') return api.removeCursorPath(pathValue);
  if (serviceId === 'codex-local') return api.removeCodexPath(pathValue);
  if (serviceId === 'github-local') return api.removeGithubPath(pathValue);
  throw new Error(`Unsupported local service: ${serviceId}`);
}

async function verifyLocalService(serviceId, api) {
  if (serviceId === 'github-local') {
    const result = await api.projects?.getLocalRepos?.();
    if (result?.success === false) {
      return { success: false, error: result.error || 'Unable to scan local repositories' };
    }
    return {
      success: true,
      message: `Connected. ${result?.repos?.length || 0} local repositories available.`,
    };
  }

  const providerMap = {
    'gemini-local': 'gemini',
    'claude-local': 'claude-cli',
    'cursor-local': 'cursor',
    'codex-local': 'codex',
  };

  const result = await api.getRepositories(providerMap[serviceId]);
  if (result?.success === false) {
    return { success: false, error: result.error || 'Unable to verify repositories for this service' };
  }

  return {
    success: true,
    message: `Connected. ${result?.repositories?.length || 0} repositories available.`,
  };
}

export default function ServiceOnboardingModal({
  open,
  initialServiceId = null,
  requiredConnection = false,
  hasConnectedServices = false,
  state,
  api,
  loadSettings,
  checkConnectionStatus,
  onClose,
  onConnected,
}) {
  const [activeServiceId, setActiveServiceId] = useState(initialServiceId || SERVICE_CATALOG[0].id);
  const [formValues, setFormValues] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  const service = useMemo(() => getServiceDefinition(activeServiceId), [activeServiceId]);

  useEffect(() => {
    if (!open) return;
    setActiveServiceId(initialServiceId || SERVICE_CATALOG[0].id);
  }, [open, initialServiceId]);

  useEffect(() => {
    setFormValues(getInitialValues(service, state));
    setFeedback(null);
  }, [service, state]);

  const existingPaths = getExistingPaths(activeServiceId, state);
  const installReady = getInstallState(activeServiceId, state);
  const closeBlocked = requiredConnection && !hasConnectedServices;

  const updateValue = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const browseForPath = async () => {
    const selectedPath = await api?.openDirectory?.();
    if (selectedPath) {
      updateValue('path', selectedPath);
    }
  };

  const handleConnect = async () => {
    if (!service || !api) return;

    setBusy(true);
    setFeedback(null);

    try {
      let result = null;

      if (service.kind === 'cloud-api-key') {
        const apiKey = (formValues.apiKey || '').trim();
        if (!apiKey) {
          throw new Error('Enter an API key before continuing.');
        }
        await api.setApiKey(service.provider, apiKey);
        result = await api.testApiKey(service.provider);
      } else if (service.kind === 'jira') {
        const baseUrl = (formValues.baseUrl || '').trim();
        const apiKey = (formValues.apiKey || '').trim();
        if (!baseUrl || !apiKey) {
          throw new Error('Enter both the Jira base URL and API token.');
        }
        await api.setJiraBaseUrl(baseUrl);
        await api.setApiKey('jira', apiKey);
        result = await api.testApiKey('jira');
      } else if (service.kind === 'cloudflare') {
        const accountId = (formValues.accountId || '').trim();
        const apiToken = (formValues.apiToken || '').trim();
        if (!accountId || !apiToken) {
          throw new Error('Enter both the Cloudflare account ID and API token.');
        }
        await api.setCloudflareConfig(accountId, apiToken);
        result = await api.testCloudflare();
      } else if (service.kind === 'local-path') {
        const selectedPath = (formValues.path || '').trim();
        if (!selectedPath) {
          throw new Error('Choose a local repository root before continuing.');
        }
        if (service.requiresInstall && !installReady) {
          throw new Error(`${service.title} is not detected on this machine yet.`);
        }
        await addPathForService(service.id, selectedPath, api);
        result = await verifyLocalService(service.id, api);
      }

      if (!result?.success) {
        throw new Error(result?.error || 'Verification failed.');
      }

      await loadSettings?.();
      await checkConnectionStatus?.();

      setFeedback({
        type: 'success',
        message: result.message || `${service.title} connected successfully.`,
      });

      onConnected?.(service.id);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Unable to connect this service.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePath = async (pathValue) => {
    setBusy(true);
    try {
      await removePathForService(service.id, pathValue, api);
      await loadSettings?.();
      await checkConnectionStatus?.();
      setFeedback(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!service || !api) return;

    setBusy(true);
    try {
      if (service.kind === 'cloud-api-key') {
        await api.removeApiKey(service.provider);
      } else if (service.kind === 'jira') {
        await api.removeApiKey('jira');
        await api.setJiraBaseUrl('');
      } else if (service.kind === 'cloudflare') {
        await api.clearCloudflareConfig();
      } else if (service.kind === 'local-path') {
        for (const pathValue of existingPaths) {
          await removePathForService(service.id, pathValue, api);
        }
      }

      await loadSettings?.();
      await checkConnectionStatus?.();
      setFeedback({ type: 'success', message: `${service.title} disconnected.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to disconnect this service.' });
    } finally {
      setBusy(false);
    }
  };

  const groupedServices = SERVICE_CATALOG.reduce((groups, entry) => {
    if (!groups[entry.category]) {
      groups[entry.category] = [];
    }
    groups[entry.category].push(entry);
    return groups;
  }, {});

  if (!open || !service) return null;

  return (
    <Modal open={open} onClose={closeBlocked ? undefined : onClose}>
      <div className="relative bg-white dark:bg-[#111318] w-[92vw] max-w-6xl h-[88vh] rounded-3xl border border-slate-200 dark:border-border-dark shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-border-dark">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Service Onboarding</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connect assistants and integrations one service at a time, and verify each one before you leave.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} disabled={closeBlocked}>
            <span className="material-symbols-outlined">close</span>
          </Button>
        </div>

        <div className="grid grid-cols-[300px_1fr] h-[calc(88vh-78px)]">
          <div className="border-r border-slate-200 dark:border-border-dark overflow-y-auto p-4 bg-slate-50/80 dark:bg-[#0c0f14]">
            {Object.entries(groupedServices).map(([category, services]) => (
              <div key={category} className="mb-6">
                <div className="text-[11px] font-black tracking-[0.24em] uppercase text-slate-400 mb-3">{category}</div>
                <div className="space-y-2">
                  {services.map((entry) => {
                    const selected = entry.id === activeServiceId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setActiveServiceId(entry.id)}
                        className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-slate-200 dark:border-border-dark bg-white dark:bg-[#12161d] hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-500">{entry.icon}</span>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{entry.title}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{entry.subtitle}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-y-auto p-8">
            <div className="max-w-2xl space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-primary text-2xl">{service.icon}</span>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{service.title}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{service.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-6">{service.description}</p>
                </div>
                <Button variant="secondary" onClick={handleDisconnect} disabled={busy}>
                  Disconnect
                </Button>
              </div>

              {service.requiresInstall && (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                  installReady
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300'
                }`}>
                  {installReady
                    ? `${service.title} is detected on this machine.`
                    : `${service.title} is not detected yet. Install it locally before completing this step.`}
                </div>
              )}

              {service.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="block text-[11px] font-black tracking-[0.18em] uppercase text-slate-400">
                    {field.label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={formValues[field.key] || ''}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="flex-1 bg-white dark:bg-[#0d1118] border border-slate-200 dark:border-border-dark rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-white"
                    />
                    {field.type === 'path' && (
                      <Button variant="secondary" onClick={browseForPath}>
                        <span className="material-symbols-outlined text-sm">folder_open</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {existingPaths.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-black tracking-[0.18em] uppercase text-slate-400">Connected Paths</div>
                  <div className="space-y-2">
                    {existingPaths.map((pathValue) => (
                      <div
                        key={pathValue}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-[#0d1118] px-4 py-3"
                      >
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">{pathValue}</span>
                        <Button variant="ghost" onClick={() => handleRemovePath(pathValue)} disabled={busy}>
                          <span className="material-symbols-outlined text-sm">close</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {feedback && (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
                }`}>
                  {feedback.message}
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {closeBlocked ? 'Connect at least one service to finish onboarding.' : 'You can return later to connect more services.'}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={onClose} disabled={closeBlocked || busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleConnect} disabled={busy}>
                    {busy ? 'VERIFYING...' : 'VERIFY & CONNECT'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
