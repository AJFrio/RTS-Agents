import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { SERVICE_CATALOG, getServiceDefinition } from './service-catalog.js';
import { buildCloudflareTokenUrl } from '../../utils/cloudflare-token-url.js';

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
    case 'antigravity-local':
      return state.settings?.antigravityPaths || [];
    case 'claude-local':
      return state.settings?.claudePaths || [];
    case 'cursor-local':
      return state.settings?.cursorPaths || [];
    case 'codex-local':
      return state.settings?.codexPaths || [];
    case 'opencode-local':
      return state.settings?.opencodePaths || [];
    case 'github-local':
      return state.settings?.githubPaths || [];
    default:
      return [];
  }
}

function getInstallState(serviceId, state) {
  if (serviceId === 'antigravity-local') {
    return state.serviceInfo?.installations?.antigravity;
  }
  if (serviceId === 'claude-local') {
    return state.serviceInfo?.installations?.claude;
  }
  if (serviceId === 'codex-local') {
    return state.serviceInfo?.installations?.codex;
  }
  if (serviceId === 'opencode-local') {
    return state.serviceInfo?.installations?.opencode;
  }
  return true;
}

function isServiceConnected(service, state, existingPaths) {
  if (!service) return false;

  if (service.kind === 'local-path') {
    return existingPaths.length > 0;
  }

  if (service.kind === 'cloud-api-key') {
    return !!state.serviceInfo?.apiKeys?.[service.provider];
  }

  if (service.kind === 'jira') {
    return !!(state.serviceInfo?.apiKeys?.jira || state.settings?.jiraBaseUrl);
  }

  if (service.kind === 'cloudflare') {
    return !!(
      state.serviceInfo?.cloudflare?.configured ||
      state.serviceInfo?.cloudflare?.accountId ||
      state.computers?.configured
    );
  }

  return false;
}

async function addPathForService(serviceId, pathValue, api) {
  if (serviceId === 'antigravity-local') return api.addAntigravityPath(pathValue);
  if (serviceId === 'claude-local') return api.addClaudePath(pathValue);
  if (serviceId === 'cursor-local') return api.addCursorPath(pathValue);
  if (serviceId === 'codex-local') return api.addCodexPath(pathValue);
  if (serviceId === 'opencode-local') return api.addOpenCodePath(pathValue);
  if (serviceId === 'github-local') return api.addGithubPath(pathValue);
  throw new Error(`Unsupported local service: ${serviceId}`);
}

async function removePathForService(serviceId, pathValue, api) {
  if (serviceId === 'antigravity-local') return api.removeAntigravityPath(pathValue);
  if (serviceId === 'claude-local') return api.removeClaudePath(pathValue);
  if (serviceId === 'cursor-local') return api.removeCursorPath(pathValue);
  if (serviceId === 'codex-local') return api.removeCodexPath(pathValue);
  if (serviceId === 'opencode-local') return api.removeOpenCodePath(pathValue);
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
    'antigravity-local': 'antigravity',
    'claude-local': 'claude-cli',
    'cursor-local': 'cursor',
    'codex-local': 'codex',
    'opencode-local': 'opencode',
  };

  const result = await api.getRepositories(providerMap[serviceId]);
  if (result?.success === false) {
    return {
      success: false,
      error: result.error || 'Unable to verify repositories for this service',
    };
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
  const serviceConnected = isServiceConnected(service, state, existingPaths);

  const updateValue = (key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const browseForPath = async () => {
    const selectedPath = await api?.openDirectory?.();
    if (selectedPath) {
      updateValue('path', selectedPath);
    }
  };

  const canDetectCloudflareAccount =
    service?.kind === 'cloudflare' && typeof api?.discoverCloudflareAccount === 'function';

  const handleOpenTokenPage = () => {
    const url = buildCloudflareTokenUrl();
    if (api?.openExternal) {
      api.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };

  const handleDetectAccountId = async () => {
    const apiToken = (formValues.apiToken || '').trim();
    if (!apiToken) {
      setFeedback({
        type: 'error',
        message: 'Paste your API token first, then detect your account ID.',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await api.discoverCloudflareAccount(apiToken);
      if (result?.success && result?.accounts?.length > 0) {
        updateValue('accountId', result.accounts[0].id);
        setFeedback({
          type: 'success',
          message: `Detected Cloudflare account ${result.accounts[0].name}.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Could not detect account ID — enter it manually.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Could not detect account ID — enter it manually.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    if (!service) return;
    if (!api) {
      setFeedback({
        type: 'error',
        message: 'Desktop bridge is unavailable. Restart the app and try again.',
      });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      let result = null;

      if (service.kind === 'cloud-api-key') {
        const apiKey = (formValues.apiKey || '').trim();
        if (!apiKey) {
          throw new Error('Enter an API key before continuing.');
        }
        setFeedback({ type: 'info', message: `Saving ${service.title} credentials...` });
        await api.setApiKey(service.provider, apiKey);
        setFeedback({ type: 'info', message: `Testing ${service.title} connection...` });
        result = await api.testApiKey(service.provider);
        if (!result?.success) {
          await api.removeApiKey(service.provider);
        }
      } else if (service.kind === 'jira') {
        const baseUrl = (formValues.baseUrl || '').trim();
        const apiKey = (formValues.apiKey || '').trim();
        if (!baseUrl || !apiKey) {
          throw new Error('Enter both the Jira base URL and API token.');
        }
        setFeedback({ type: 'info', message: 'Saving Jira settings...' });
        await api.setJiraBaseUrl(baseUrl);
        await api.setApiKey('jira', apiKey);
        setFeedback({ type: 'info', message: 'Testing Jira connection...' });
        result = await api.testApiKey('jira');
        if (!result?.success) {
          await api.removeApiKey('jira');
          await api.setJiraBaseUrl('');
        }
      } else if (service.kind === 'cloudflare') {
        const accountId = (formValues.accountId || '').trim();
        const apiToken = (formValues.apiToken || '').trim();
        if (!accountId || !apiToken) {
          throw new Error('Enter both the Cloudflare account ID and API token.');
        }
        setFeedback({ type: 'info', message: 'Saving Cloudflare settings...' });
        await api.setCloudflareConfig(accountId, apiToken);
        setFeedback({ type: 'info', message: 'Testing Cloudflare KV access...' });
        result = await api.testCloudflare();
        if (!result?.success) {
          await api.clearCloudflareConfig();
        }
      } else if (service.kind === 'local-path') {
        const selectedPath = (formValues.path || '').trim();
        if (!selectedPath) {
          throw new Error('Choose a local repository root before continuing.');
        }
        if (service.requiresInstall && !installReady) {
          throw new Error(`${service.title} is not detected on this machine yet.`);
        }
        setFeedback({ type: 'info', message: `Saving ${service.title} repository root...` });
        await addPathForService(service.id, selectedPath, api);
        setFeedback({ type: 'info', message: `Verifying ${service.title} projects...` });
        result = await verifyLocalService(service.id, api);
        if (!result?.success) {
          await removePathForService(service.id, selectedPath, api);
        }
      }

      if (!result?.success) {
        throw new Error(result?.error || result?.message || 'Verification failed.');
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
      <div className="relative flex h-[min(88vh,900px)] w-[92vw] max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-border-dark dark:bg-[#111318]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5 dark:border-border-dark">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
              Service Onboarding
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Connect assistants and integrations one service at a time, and verify each one before
              you leave.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} disabled={closeBlocked} className="shrink-0">
            <span className="material-symbols-outlined">close</span>
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr]">
          <div className="max-h-44 shrink-0 overflow-y-auto border-b border-slate-200 bg-slate-50/80 p-3 sm:p-4 md:max-h-none md:border-b-0 md:border-r dark:border-border-dark dark:bg-[#0c0f14]">
            {Object.entries(groupedServices).map(([category, services]) => (
              <div key={category} className="mb-4 last:mb-0 md:mb-6">
                <div className="mb-2 text-[11px] font-black tracking-[0.24em] uppercase text-slate-400 md:mb-3">
                  {category}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-2 md:overflow-visible md:pb-0">
                  {services.map((entry) => {
                    const selected = entry.id === activeServiceId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setActiveServiceId(entry.id)}
                        className={`shrink-0 rounded-2xl border px-3 py-2.5 text-left transition-all md:w-full md:px-4 md:py-3 ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-slate-200 bg-white hover:border-primary/40 dark:border-border-dark dark:bg-[#12161d]'
                        }`}
                      >
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className="material-symbols-outlined text-slate-500">
                            {entry.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="whitespace-nowrap font-semibold text-slate-900 md:whitespace-normal dark:text-white">
                              {entry.title}
                            </div>
                            <div className="hidden text-xs text-slate-500 md:block dark:text-slate-400">
                              {entry.subtitle}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-6 md:p-8">
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="material-symbols-outlined shrink-0 text-2xl text-primary">
                      {service.icon}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                        {service.title}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {service.subtitle}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {service.description}
                  </p>
                </div>
                {serviceConnected && (
                  <Button variant="secondary" onClick={handleDisconnect} disabled={busy}>
                    Disconnect
                  </Button>
                )}
              </div>

              {service.requiresInstall && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    installReady
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300'
                  }`}
                >
                  {installReady
                    ? `${service.title} is detected on this machine.`
                    : `${service.title} is not detected yet. Install it locally before completing this step.`}
                </div>
              )}

              {service.kind === 'cloudflare' && (
                <div className="rounded-2xl border border-slate-200 dark:border-border-dark bg-slate-50/60 dark:bg-[#0d1118] p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">bolt</span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Quick Setup
                    </h4>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-6">
                    1. Approve the pre-configured token in your browser (Workers KV Storage: Edit
                    is selected for you). 2. Copy the secret token Cloudflare shows. 3. Paste it
                    below — we&apos;ll detect your account ID automatically.
                  </p>
                  <div>
                    <Button variant="primary" onClick={handleOpenTokenPage} disabled={busy}>
                      <span className="material-symbols-outlined text-sm">token</span>
                      Create Token on Cloudflare
                    </Button>
                  </div>
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
                    {service.kind === 'cloudflare' &&
                      field.key === 'accountId' &&
                      canDetectCloudflareAccount && (
                        <Button
                          variant="secondary"
                          onClick={handleDetectAccountId}
                          disabled={busy}
                        >
                          Detect Account ID
                        </Button>
                      )}
                  </div>
                </div>
              ))}

              {existingPaths.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-black tracking-[0.18em] uppercase text-slate-400">
                    Connected Paths
                  </div>
                  <div className="space-y-2">
                    {existingPaths.map((pathValue) => (
                      <div
                        key={pathValue}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-[#0d1118] px-4 py-3"
                      >
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                          {pathValue}
                        </span>
                        <Button
                          variant="ghost"
                          onClick={() => handleRemovePath(pathValue)}
                          disabled={busy}
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    feedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300'
                      : feedback.type === 'info'
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-300'
                        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark">
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {closeBlocked
                    ? 'Connect at least one service to finish onboarding.'
                    : 'You can return later to connect more services.'}
                </div>
                <div className="flex shrink-0 gap-3">
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
