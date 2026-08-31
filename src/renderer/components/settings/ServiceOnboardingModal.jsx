import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { IconClose } from '../ui/icons.jsx';
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
      <div className="flex h-[min(88vh,900px)] w-[92vw] max-w-6xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
              Service Onboarding
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Connect assistants and integrations one service at a time, and verify each one before
              you leave.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={closeBlocked}
            aria-label="Close service onboarding"
            className="shrink-0"
          >
            <IconClose size={16} />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr]">
          <div className="max-h-44 shrink-0 overflow-y-auto border-b border-border-light bg-sidebar-light p-3 md:max-h-none md:border-b-0 md:border-r dark:border-border-dark dark:bg-sidebar-dark">
            {Object.entries(groupedServices).map(([category, services]) => (
              <div key={category} className="mb-4 last:mb-0 md:mb-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {category}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1.5 md:overflow-visible md:pb-0">
                  {services.map((entry) => {
                    const selected = entry.id === activeServiceId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setActiveServiceId(entry.id)}
                        className={`shrink-0 rounded-md border px-3 py-2 text-left transition-colors md:w-full ${
                          selected
                            ? 'border-neutral-900 bg-neutral-900/5 dark:border-neutral-100 dark:bg-neutral-100/5'
                            : 'border-border-light hover:bg-neutral-100 dark:border-border-dark dark:hover:bg-neutral-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-neutral-500 dark:text-neutral-400" aria-hidden="true">
                            {entry.icon}
                          </span>
                          <div className="min-w-0">
                            <div className={`whitespace-nowrap text-[13px] font-medium md:whitespace-normal ${selected ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}>
                              {entry.title}
                            </div>
                            <div className="hidden text-[11px] text-neutral-500 md:block dark:text-neutral-400">
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

          <div className="min-h-0 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-2xl space-y-5">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="material-symbols-outlined shrink-0 text-[20px] text-neutral-700 dark:text-neutral-300" aria-hidden="true">
                      {service.icon}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                        {service.title}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {service.subtitle}
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
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
                  className={`rounded-md border px-3 py-2 text-[13px] ${
                    installReady
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {installReady
                    ? `${service.title} is detected on this machine.`
                    : `${service.title} is not detected yet. Install it locally before completing this step.`}
                </div>
              )}

              {service.kind === 'cloudflare' && (
                <div className="rounded-md border border-border-light dark:border-border-dark bg-inset-light dark:bg-inset-dark p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-neutral-600 dark:text-neutral-300" aria-hidden="true">
                      bolt
                    </span>
                    <h4 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                      Quick Setup
                    </h4>
                  </div>
                  <p className="text-[13px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                    1. Approve the pre-configured token in your browser (Workers KV Storage: Edit
                    is selected for you). 2. Copy the secret token Cloudflare shows. 3. Paste it
                    below — we&apos;ll detect your account ID automatically.
                  </p>
                  <div>
                    <Button variant="primary" onClick={handleOpenTokenPage} disabled={busy}>
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">token</span>
                      Create Token on Cloudflare
                    </Button>
                  </div>
                </div>
              )}

              {service.fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {field.label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={formValues[field.key] || ''}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="flex-1"
                    />
                    {field.type === 'path' && (
                      <Button variant="secondary" onClick={browseForPath} aria-label="Browse for folder">
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">folder_open</span>
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
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Connected Paths
                  </div>
                  <div className="space-y-1.5">
                    {existingPaths.map((pathValue) => (
                      <div
                        key={pathValue}
                        className="flex items-center justify-between gap-3 rounded-md border border-border-light dark:border-border-dark bg-inset-light dark:bg-inset-dark px-3 py-2"
                      >
                        <span className="truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">
                          {pathValue}
                        </span>
                        <Button
                          variant="ghost"
                          onClick={() => handleRemovePath(pathValue)}
                          disabled={busy}
                          aria-label={`Remove ${pathValue}`}
                        >
                          <IconClose size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {feedback && (
                <div
                  className={`rounded-md border px-3 py-2 text-[13px] ${
                    feedback.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : feedback.type === 'info'
                        ? 'border-border-strong-light bg-neutral-100 text-neutral-600 dark:border-border-strong-dark dark:bg-neutral-800 dark:text-neutral-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border-light pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {closeBlocked
                    ? 'Connect at least one service to finish onboarding.'
                    : 'You can return later to connect more services.'}
                </div>
                <div className="flex shrink-0 gap-2">
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
