import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { IconClose, IconFolder, providerMeta } from '../ui/icons.jsx';
import { getServiceDefinition } from './service-catalog.js';
import { buildCloudflareTokenUrl } from '../../utils/cloudflare-token-url.js';
import {
  detectAndConnectCloudflare,
  getInitialValues,
  getOnboardingFieldHelper,
  getOnboardingModalTitle,
  verifyCloudflareConnection,
} from './service-onboarding.js';

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
  const [formValues, setFormValues] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const service = useMemo(
    () => (open ? getServiceDefinition(initialServiceId) : null),
    [open, initialServiceId]
  );

  // Seed only when the modal opens or the focused service changes — not on
  // every `state` tick (that would wipe a pasted apiToken).
  useEffect(() => {
    if (!open || !initialServiceId) return;
    setFormValues(getInitialValues(getServiceDefinition(initialServiceId), stateRef.current));
    setFeedback(null);
  }, [open, initialServiceId]);

  const existingPaths = getExistingPaths(initialServiceId, state);
  const installReady = getInstallState(initialServiceId, state);
  const closeBlocked = requiredConnection && !hasConnectedServices;
  const serviceConnected = isServiceConnected(service, state, existingPaths);
  const modalTitle = getOnboardingModalTitle(service, serviceConnected);
  const ServiceIcon = providerMeta(service?.provider).Icon;

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

  const refreshAfterConnect = async () => {
    await loadSettings?.();
    await checkConnectionStatus?.();
  };

  const handleDetectAndConnect = async () => {
    if (!api) {
      setFeedback({
        type: 'error',
        message: 'Desktop bridge is unavailable. Restart the app and try again.',
      });
      return;
    }

    setBusy(true);
    setFeedback({ type: 'info', message: 'Detecting Cloudflare account...' });
    try {
      const token = (formValues.apiToken || '').trim();
      const result = await detectAndConnectCloudflare({ api, apiToken: token });
      if (result.formPatch) {
        setFormValues((prev) => ({ ...prev, ...result.formPatch }));
      }
      if (result.ok) {
        await refreshAfterConnect();
        onConnected?.(service.id);
      }
      setFeedback(result.feedback);
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
        const verify = await verifyCloudflareConnection({
          api,
          accountId: formValues.accountId,
          apiToken: formValues.apiToken,
        });
        if (!verify.ok) {
          throw new Error(verify.feedback.message);
        }
        result = { success: true, message: verify.feedback.message };
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

      await refreshAfterConnect();

      if (service.kind === 'local-path' || service.kind === 'cloud-api-key' || service.kind === 'jira') {
        setFormValues((prev) => ({
          ...prev,
          path: '',
          apiKey: '',
        }));
      }

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
      await refreshAfterConnect();
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

      await refreshAfterConnect();
      setFormValues(getInitialValues(service, {}));
      setFeedback({ type: 'success', message: `${service.title} disconnected.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err?.message || 'Unable to disconnect this service.' });
    } finally {
      setBusy(false);
    }
  };

  if (!open || !service) return null;

  return (
    <Modal open={open} onClose={closeBlocked ? undefined : onClose} size="md">
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-light px-4 py-3 dark:border-border-dark">
          <h2 className="min-w-0 truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
            {modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeBlocked}
            aria-label="Close service setup"
            className="shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <IconClose size={16} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border-light bg-inset-light text-neutral-600 dark:border-border-dark dark:bg-inset-dark dark:text-neutral-300">
              <ServiceIcon size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
                {service.title}
              </h3>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                {service.description}
              </p>
            </div>
          </div>

          {service.requiresInstall && (
            <div
              className={`rounded-md border px-3 py-2 text-[12px] ${
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
            <div className="rounded-md border border-border-light bg-inset-light px-3 py-2.5 dark:border-border-dark dark:bg-inset-dark">
              <p className="text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                Create a Workers KV token, paste it below, then Detect & connect.
              </p>
              <div className="mt-2">
                <Button variant="secondary" onClick={handleOpenTokenPage} disabled={busy}>
                  Create token on Cloudflare
                </Button>
              </div>
            </div>
          )}

          {service.fields.map((field) => {
            const helper = getOnboardingFieldHelper(service, field.key);
            const isPath = field.type === 'path';
            const showDetect =
              service.kind === 'cloudflare' && field.key === 'accountId' && canDetectCloudflareAccount;

            return (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {field.label}
                </label>
                {isPath ? (
                  <div className="flex overflow-hidden rounded-sm border border-border-light dark:border-border-dark">
                    <input
                      type="text"
                      value={formValues[field.key] || ''}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="min-w-0 flex-1 rounded-none border-0"
                    />
                    <button
                      type="button"
                      onClick={browseForPath}
                      aria-label="Browse for folder"
                      className="inline-flex shrink-0 items-center gap-1.5 border-l border-border-light px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-border-dark dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      <IconFolder size={14} />
                      Browse
                    </button>
                  </div>
                ) : showDetect ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={formValues[field.key] || ''}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="min-w-0 flex-1"
                    />
                    <Button variant="secondary" onClick={handleDetectAndConnect} disabled={busy}>
                      {busy ? 'Connecting…' : 'Detect & connect'}
                    </Button>
                  </div>
                ) : (
                  <input
                    type={field.type === 'password' ? 'password' : 'text'}
                    value={formValues[field.key] || ''}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    className="w-full"
                  />
                )}
                {helper ? (
                  <p className="text-[12px] text-neutral-500 dark:text-neutral-400">{helper}</p>
                ) : null}
              </div>
            );
          })}

          {existingPaths.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Connected paths
              </div>
              <div className="divide-y divide-border-light dark:divide-border-dark">
                {existingPaths.map((pathValue) => (
                  <div key={pathValue} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-neutral-700 dark:text-neutral-300">
                      {pathValue}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePath(pathValue)}
                      disabled={busy}
                      aria-label={`Remove ${pathValue}`}
                      className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    >
                      <IconClose size={14} />
                    </button>
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
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border-light px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-border-dark">
          <div className="min-w-0">
            {closeBlocked ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Connect at least one service to finish onboarding.
              </p>
            ) : serviceConnected ? (
              <Button variant="danger" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </Button>
            ) : null}
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
    </Modal>
  );
}
