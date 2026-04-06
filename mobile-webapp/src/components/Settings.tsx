import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { storageService } from '../services/storage-service';
import { cloudflareKvService } from '../services/cloudflare-kv-service';
import ServiceOnboardingSheet from './ServiceOnboardingSheet';
import { MOBILE_SERVICE_CATALOG, type MobileServiceId } from './mobile-service-catalog';
import ModelSelector from './ModelSelector';

function NotificationSettings({ enableNotifications }: { enableNotifications: () => Promise<string> }) {
  const [status, setStatus] = useState<string>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const handleEnable = async () => {
    const result = await enableNotifications();
    setStatus(result);
  };

  if (status === 'unsupported') {
    return <p className="text-xs text-slate-500">Notifications are not supported on this device.</p>;
  }

  if (status === 'granted') {
    return (
      <div className="flex items-center gap-2 text-emerald-500">
        <span className="material-symbols-outlined text-sm">check_circle</span>
        <span className="text-sm font-semibold">Notifications Enabled</span>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <span className="material-symbols-outlined text-sm">block</span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Notifications Blocked</span>
          <span className="text-xs text-slate-500">Enable in browser settings</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleEnable}
      className="bg-primary text-black px-4 py-2 text-sm font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
    >
      Enable Notifications
    </button>
  );
}

function getStatusMeta(connected: boolean) {
  return connected
    ? { label: 'Connected', className: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-300' }
    : { label: 'Attention', className: 'text-red-700 bg-red-50 dark:bg-red-950/20 dark:text-red-300' };
}

export default function Settings() {
  const {
    state,
    dispatch,
    setApiKey,
    testApiKey,
    setCloudflareConfig,
    testCloudflareConfig,
    pullKeysFromKV,
    enableNotifications,
    setModel,
  } = useApp();

  const { configuredServices, settings } = state;
  const [syncingKeys, setSyncingKeys] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; keysImported?: string[]; error?: string } | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState<MobileServiceId | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const connectedServices = useMemo(() => {
    const ids: MobileServiceId[] = [];
    if (configuredServices.jules) ids.push('jules');
    if (configuredServices.cursor) ids.push('cursor');
    if (configuredServices.codex) ids.push('codex');
    if (configuredServices.claude) ids.push('claude');
    if (configuredServices.openrouter) ids.push('openrouter');
    if (configuredServices.gemini) ids.push('gemini');
    if (configuredServices.github) ids.push('github');
    if (configuredServices.jira || !!settings.jiraBaseUrl?.trim()) ids.push('jira');
    if (configuredServices.cloudflare) ids.push('cloudflare');
    return ids;
  }, [configuredServices, settings.jiraBaseUrl]);

  useEffect(() => {
    if (!autoOpened && connectedServices.length === 0) {
      setOnboardingOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, connectedServices.length]);

  const openOnboarding = (serviceId: MobileServiceId | null = null) => {
    setActiveServiceId(serviceId);
    setOnboardingOpen(true);
  };

  const refreshConfiguredServices = () => {
    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
  };

  const handleConnect = async (serviceId: MobileServiceId, values: Record<string, string>) => {
    try {
      if (serviceId === 'cloudflare') {
        const accountId = (values.accountId || '').trim();
        const apiToken = (values.apiToken || '').trim();
        const namespaceTitle = (values.namespaceTitle || 'rtsa').trim() || 'rtsa';
        if (!accountId || !apiToken) {
          return { success: false, error: 'Enter both the Cloudflare account ID and API token.' };
        }
        setCloudflareConfig({ accountId, apiToken, namespaceTitle });
        const result = await testCloudflareConfig();
        refreshConfiguredServices();
        return result;
      }

      if (serviceId === 'jira') {
        const baseUrl = (values.baseUrl || settings.jiraBaseUrl || '').trim();
        const apiKey = (values.apiKey || '').trim();
        if (!baseUrl || !apiKey) {
          return { success: false, error: 'Enter both the Jira Base URL and API token.' };
        }
        dispatch({ type: 'SET_SETTINGS', payload: { jiraBaseUrl: baseUrl } });
        setApiKey('jira', apiKey);
        const result = await testApiKey('jira');
        refreshConfiguredServices();
        return result;
      }

      const apiKey = (values.apiKey || '').trim();
      if (!apiKey) {
        return { success: false, error: 'Enter an API key before continuing.' };
      }

      setApiKey(serviceId, apiKey);
      const result = await testApiKey(serviceId);
      refreshConfiguredServices();
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unable to connect this service.' };
    }
  };

  const handleDisconnect = (serviceId: MobileServiceId) => {
    if (serviceId === 'cloudflare') {
      storageService.removeCloudflareConfig();
      cloudflareKvService.setConfig(null);
    } else if (serviceId === 'jira') {
      storageService.removeApiKey('jira');
      dispatch({ type: 'SET_SETTINGS', payload: { jiraBaseUrl: '' } });
    } else {
      storageService.removeApiKey(serviceId);
    }

    refreshConfiguredServices();
  };

  const handleThemeChange = (theme: 'system' | 'light' | 'dark') => {
    dispatch({ type: 'SET_SETTINGS', payload: { theme } });
  };

  const handlePollingToggle = () => {
    dispatch({ type: 'SET_SETTINGS', payload: { autoPolling: !settings.autoPolling } });
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SETTINGS', payload: { pollingInterval: parseInt(e.target.value, 10) * 1000 } });
  };

  return (
    <>
      <div className="p-4 space-y-6">
        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-lg">link</span>
                <h3 className="text-base font-semibold">Connected Services</h3>
              </div>
              <p className="text-xs text-slate-500">
                Service setup now uses guided onboarding. Existing saved keys are still recognized and shown here automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openOnboarding()}
              className="shrink-0 bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm"
            >
              Add Service
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          {connectedServices.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-2xl">hub</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">No services connected yet</h3>
                <p className="text-sm text-slate-500 mt-2">Start onboarding to connect your cloud services.</p>
              </div>
              <button
                type="button"
                onClick={() => openOnboarding()}
                className="bg-primary text-black px-4 py-2 text-sm font-semibold rounded-lg"
              >
                Start Onboarding
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {connectedServices.map((serviceId) => {
                const definition = MOBILE_SERVICE_CATALOG.find((service) => service.id === serviceId);
                if (!definition) return null;

                const connected = serviceId === 'jira'
                  ? configuredServices.jira && !!settings.jiraBaseUrl?.trim()
                  : serviceId === 'cloudflare'
                    ? configuredServices.cloudflare
                    : configuredServices[serviceId];
                const statusMeta = getStatusMeta(!!connected);

                const summary = serviceId === 'jira'
                  ? settings.jiraBaseUrl || 'Jira base URL missing'
                  : serviceId === 'cloudflare'
                    ? 'Cloudflare KV sync enabled'
                    : 'API key saved and ready';

                return (
                  <div
                    key={serviceId}
                    className="rounded-2xl border border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-slate-900/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined">{definition.icon}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900 dark:text-white">{definition.title}</h4>
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{definition.subtitle}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{summary}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => openOnboarding(serviceId)}
                        className="flex-1 border border-slate-200 dark:border-border-dark text-slate-600 dark:text-slate-300 py-2 rounded-xl text-sm font-semibold"
                      >
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(serviceId)}
                        className="flex-1 border border-red-900/50 text-red-400 py-2 rounded-xl text-sm font-semibold"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {configuredServices.cloudflare && (
          <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-lg">sync</span>
              <h3 className="text-base font-semibold">Sync Keys from Cloud</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Pull API keys from the Cloudflare KV store. Existing saved keys will be merged and recognized automatically.
            </p>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  setSyncingKeys(true);
                  setSyncResult(null);
                  try {
                    const result = await pullKeysFromKV();
                    setSyncResult(result);
                    refreshConfiguredServices();
                  } catch (err) {
                    setSyncResult({
                      success: false,
                      error: err instanceof Error ? err.message : 'Sync failed',
                    });
                  } finally {
                    setSyncingKeys(false);
                  }
                }}
                disabled={syncingKeys}
                className="w-full flex items-center justify-center gap-2 bg-primary/20 border border-primary text-primary py-3 text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-sm ${syncingKeys ? 'animate-spin' : ''}`}>
                  {syncingKeys ? 'sync' : 'cloud_download'}
                </span>
                {syncingKeys ? 'Syncing...' : 'Pull Keys from KV Store'}
              </button>

              {syncResult && (
                <div className={`p-3 rounded-lg ${
                  syncResult.success
                    ? 'bg-emerald-500/10 dark:bg-emerald-900/20 border border-emerald-500/50'
                    : 'bg-red-500/10 dark:bg-red-900/20 border border-red-500/50'
                }`}>
                  {syncResult.success ? (
                    <>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">Keys synced successfully.</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        {syncResult.keysImported?.length ? `Imported: ${syncResult.keysImported.join(', ')}` : 'No new keys found.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-red-400">{syncResult.error || 'Failed to sync keys'}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">smart_toy</span>
            <h3 className="text-base font-semibold">Agent Model</h3>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Orchestrator Model
            </label>
            <ModelSelector
              value={settings.selectedModel}
              onChange={(model) => setModel(model)}
            />
            <p className="text-xs text-slate-500">The AI model used for the main agent chat.</p>
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">notifications</span>
            <h3 className="text-base font-semibold">Notifications</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Enable native notifications to get alerted when tasks are ready for review.
          </p>
          <NotificationSettings enableNotifications={enableNotifications} />
        </section>

        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">palette</span>
            <h3 className="text-base font-semibold">Display</h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => handleThemeChange(theme)}
                className={`flex flex-col items-center gap-2 p-3 border rounded-lg transition-all duration-200 ${
                  settings.theme === theme
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className="material-symbols-outlined text-lg">
                  {theme === 'system' ? 'settings_brightness' : theme === 'light' ? 'light_mode' : 'dark_mode'}
                </span>
                <span className="text-xs font-medium capitalize">{theme}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">schedule</span>
            <h3 className="text-base font-semibold">Data Polling</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoPolling}
                onChange={handlePollingToggle}
                className="w-4 h-4 bg-transparent border-primary text-primary focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-600 dark:text-slate-300">Enable auto refresh</span>
            </label>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Refresh interval</label>
                <span className="text-primary font-semibold text-sm">{Math.round(settings.pollingInterval / 1000)}s</span>
              </div>
              <input
                type="range"
                min="5"
                max="300"
                step="5"
                value={Math.round(settings.pollingInterval / 1000)}
                onChange={handleIntervalChange}
                disabled={!settings.autoPolling}
                className="w-full h-1 bg-slate-200 dark:bg-border-dark appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        <section className="text-center py-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="material-symbols-outlined text-primary text-lg">grid_view</span>
            <span className="font-semibold text-sm">RTS Agents</span>
          </div>
          <p className="text-xs text-slate-500">Mobile PWA v1.0.0</p>
        </section>
      </div>

      <ServiceOnboardingSheet
        open={onboardingOpen}
        initialServiceId={activeServiceId}
        requiredConnection={connectedServices.length === 0}
        hasConnectedServices={connectedServices.length > 0}
        jiraBaseUrl={settings.jiraBaseUrl || ''}
        onClose={() => setOnboardingOpen(false)}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
    </>
  );
}
