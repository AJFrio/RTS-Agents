import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import Button from '../components/ui/Button.jsx';
import ModelSelector from '../components/settings/ModelSelector.jsx';
import ServiceOnboardingModal from '../components/settings/ServiceOnboardingModal.jsx';
import { getServiceDefinition } from '../components/settings/service-catalog.js';

function getStatusMeta(status) {
  if (!status) {
    return { label: 'Pending', className: 'text-slate-500 bg-slate-100 dark:bg-slate-800/80 dark:text-slate-300' };
  }
  if (status.success || status.connected) {
    return { label: 'Connected', className: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300' };
  }
  return { label: 'Attention', className: 'text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300' };
}

function buildConnectedServices(state) {
  const services = [];
  const apiKeys = state.serviceInfo?.apiKeys || {};

  if (apiKeys.jules) services.push('jules-cloud');
  if (apiKeys.cursor) services.push('cursor-cloud');
  if ((state.settings?.cursorPaths || []).length > 0) services.push('cursor-local');
  if (apiKeys.codex) services.push('codex-cloud');
  if ((state.settings?.codexPaths || []).length > 0) services.push('codex-local');
  if (apiKeys.claude) services.push('claude-cloud');
  if (state.serviceInfo?.installations?.claude || (state.settings?.claudePaths || []).length > 0) services.push('claude-local');
  if (state.serviceInfo?.installations?.gemini || (state.settings?.geminiPaths || []).length > 0) services.push('gemini-local');
  if (apiKeys.gemini) services.push('gemini-api');
  if (apiKeys.openrouter) services.push('openrouter-cloud');
  if (apiKeys.openai) services.push('openai-cloud');
  if (apiKeys.github) services.push('github-cloud');
  if ((state.settings?.githubPaths || []).length > 0) services.push('github-local');
  if (apiKeys.jira || state.settings?.jiraBaseUrl) services.push('jira-cloud');
  if (state.serviceInfo?.cloudflare?.configured || state.computers?.configured) services.push('cloudflare-sync');

  return [...new Set(services)];
}

function getServiceStatus(serviceId, state) {
  switch (serviceId) {
    case 'jules-cloud':
      return state.connectionStatus?.jules;
    case 'cursor-cloud':
      return state.connectionStatus?.cursor;
    case 'codex-cloud':
      return state.connectionStatus?.codex;
    case 'claude-cloud':
      return state.connectionStatus?.['claude-cloud'];
    case 'claude-local':
      return state.connectionStatus?.['claude-cli'] || { success: !!state.serviceInfo?.installations?.claude };
    case 'gemini-local':
    case 'gemini-api':
      return state.connectionStatus?.gemini || { success: !!state.serviceInfo?.installations?.gemini };
    case 'openrouter-cloud':
      return state.connectionStatus?.openrouter;
    case 'openai-cloud':
      return state.connectionStatus?.openai;
    case 'github-cloud':
      return state.connectionStatus?.github;
    case 'jira-cloud':
      return state.connectionStatus?.jira;
    case 'cloudflare-sync':
      return state.computers?.configured ? { success: true, connected: true } : { success: false, error: 'Not configured' };
    default:
      return { success: true, connected: true };
  }
}

function getServiceSummary(serviceId, state, status) {
  switch (serviceId) {
    case 'cursor-local':
      return `${state.settings?.cursorPaths?.length || 0} repository roots connected`;
    case 'codex-local':
      return `${state.settings?.codexPaths?.length || 0} repository roots connected`;
    case 'claude-local':
      return state.serviceInfo?.installations?.claude
        ? `${state.settings?.claudePaths?.length || 0} repository roots linked`
        : 'Repository roots saved, but Claude Code is not detected locally';
    case 'gemini-local':
      return state.serviceInfo?.installations?.gemini
        ? `${state.settings?.geminiPaths?.length || 0} repository roots linked`
        : 'Repository roots saved, but Gemini CLI is not detected locally';
    case 'github-local':
      return `${state.settings?.githubPaths?.length || 0} repository roots connected`;
    case 'jira-cloud':
      return state.settings?.jiraBaseUrl || status?.error || 'Jira is configured';
    case 'cloudflare-sync':
      return state.serviceInfo?.cloudflare?.accountId
        ? `Account ${state.serviceInfo.cloudflare.accountId}`
        : 'Cloudflare KV sync enabled';
    default:
      return status?.error || 'Verified and ready to use';
  }
}

function isDisconnectable(serviceId, state) {
  if (['jules-cloud', 'cursor-cloud', 'codex-cloud', 'claude-cloud', 'gemini-api', 'openrouter-cloud', 'openai-cloud', 'github-cloud', 'jira-cloud', 'cloudflare-sync'].includes(serviceId)) {
    return true;
  }
  if (serviceId === 'cursor-local') return (state.settings?.cursorPaths || []).length > 0;
  if (serviceId === 'codex-local') return (state.settings?.codexPaths || []).length > 0;
  if (serviceId === 'claude-local') return (state.settings?.claudePaths || []).length > 0;
  if (serviceId === 'gemini-local') return (state.settings?.geminiPaths || []).length > 0;
  if (serviceId === 'github-local') return (state.settings?.githubPaths || []).length > 0;
  return false;
}

export default function SettingsPage() {
  const { state, dispatch, api, loadSettings, checkConnectionStatus } = useApp();
  const [selectedModel, setSelectedModel] = useState(state.settings.selectedModel || 'openrouter/openai/gpt-4o');
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeServiceId, setActiveServiceId] = useState(null);
  const [autoOpened, setAutoOpened] = useState(false);
  const [busyServiceId, setBusyServiceId] = useState(null);

  const connectedServices = useMemo(() => buildConnectedServices(state), [state]);

  useEffect(() => {
    setSelectedModel(state.settings.selectedModel || 'openrouter/openai/gpt-4o');
  }, [state.settings.selectedModel]);

  useEffect(() => {
    if (autoOpened) return;
    if (Object.keys(state.connectionStatus || {}).length === 0) return;
    if (connectedServices.length === 0) {
      setOnboardingOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, connectedServices.length, state.connectionStatus]);

  const saveModel = useCallback(async (model) => {
    setSelectedModel(model);
    if (api?.setModel) {
      await api.setModel(model);
      dispatch({ type: 'SET_SETTINGS', payload: { selectedModel: model } });
    }
  }, [api, dispatch]);

  const openOnboarding = useCallback((serviceId = null) => {
    setActiveServiceId(serviceId);
    setOnboardingOpen(true);
  }, []);

  const disconnectService = useCallback(async (serviceId) => {
    if (!api) return;

    setBusyServiceId(serviceId);
    try {
      if (serviceId === 'jules-cloud') {
        await api.removeApiKey('jules');
      } else if (serviceId === 'cursor-cloud') {
        await api.removeApiKey('cursor');
      } else if (serviceId === 'codex-cloud') {
        await api.removeApiKey('codex');
      } else if (serviceId === 'claude-cloud') {
        await api.removeApiKey('claude');
      } else if (serviceId === 'gemini-api') {
        await api.removeApiKey('gemini');
      } else if (serviceId === 'openrouter-cloud') {
        await api.removeApiKey('openrouter');
      } else if (serviceId === 'openai-cloud') {
        await api.removeApiKey('openai');
      } else if (serviceId === 'github-cloud') {
        await api.removeApiKey('github');
      } else if (serviceId === 'jira-cloud') {
        await api.removeApiKey('jira');
        await api.setJiraBaseUrl('');
      } else if (serviceId === 'cloudflare-sync') {
        await api.clearCloudflareConfig();
      } else if (serviceId === 'cursor-local') {
        for (const pathValue of state.settings?.cursorPaths || []) {
          await api.removeCursorPath(pathValue);
        }
      } else if (serviceId === 'codex-local') {
        for (const pathValue of state.settings?.codexPaths || []) {
          await api.removeCodexPath(pathValue);
        }
      } else if (serviceId === 'claude-local') {
        for (const pathValue of state.settings?.claudePaths || []) {
          await api.removeClaudePath(pathValue);
        }
      } else if (serviceId === 'gemini-local') {
        for (const pathValue of state.settings?.geminiPaths || []) {
          await api.removeGeminiPath(pathValue);
        }
      } else if (serviceId === 'github-local') {
        for (const pathValue of state.settings?.githubPaths || []) {
          await api.removeGithubPath(pathValue);
        }
      }

      await loadSettings();
      await checkConnectionStatus();
    } finally {
      setBusyServiceId(null);
    }
  }, [api, checkConnectionStatus, loadSettings, state.settings]);

  const refreshStatus = useCallback(async () => {
    setBusyServiceId('refresh');
    try {
      await loadSettings();
      await checkConnectionStatus();
    } finally {
      setBusyServiceId(null);
    }
  }, [checkConnectionStatus, loadSettings]);

  const setTheme = useCallback((theme) => {
    api?.setTheme?.(theme);
    dispatch({ type: 'SET_SETTINGS', payload: { theme } });
  }, [api, dispatch]);

  const setDisplayMode = useCallback((mode) => {
    api?.setDisplayMode?.(mode);
    dispatch({ type: 'SET_SETTINGS', payload: { displayMode: mode } });
  }, [api, dispatch]);

  const updatePolling = useCallback((autoPolling, intervalMs) => {
    api?.setPolling?.(autoPolling, intervalMs);
    dispatch({ type: 'SET_SETTINGS', payload: { autoPolling, pollingInterval: intervalMs } });
  }, [api, dispatch]);

  const updateApp = useCallback(() => {
    api?.updateApp?.();
  }, [api]);

  return (
    <>
      <div id="view-settings" className="view-content max-w-6xl mx-auto w-full space-y-8">
        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-primary text-3xl">link</span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Connected Services</h2>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-6">
                Setup now happens through guided onboarding. Settings only shows services that are already linked, along with their current connection state.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={refreshStatus} disabled={busyServiceId === 'refresh'}>
                {busyServiceId === 'refresh' ? 'CHECKING...' : 'REFRESH STATUS'}
              </Button>
              <Button variant="primary" onClick={() => openOnboarding()}>
                ADD SERVICE
              </Button>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          {connectedServices.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary">
                <span className="material-symbols-outlined text-3xl">hub</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">No services connected yet</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Start onboarding to connect your local or cloud assistants before using the dashboard.
                </p>
              </div>
              <Button variant="primary" onClick={() => openOnboarding()}>
                START ONBOARDING
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {connectedServices.map((serviceId) => {
                const definition = getServiceDefinition(serviceId);
                const status = getServiceStatus(serviceId, state);
                const statusMeta = getStatusMeta(status);
                const summary = getServiceSummary(serviceId, state, status);

                return (
                  <div
                    key={serviceId}
                    className="rounded-2xl border border-slate-200 dark:border-border-dark bg-slate-50/60 dark:bg-[#11151b] p-6"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined">{definition?.icon || 'link'}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{definition?.title || serviceId}</h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{definition?.subtitle}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-3">{summary}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <Button variant="secondary" onClick={() => openOnboarding(serviceId)}>
                        MANAGE
                      </Button>
                      {isDisconnectable(serviceId, state) && (
                        <Button
                          variant="danger"
                          onClick={() => disconnectService(serviceId)}
                          disabled={busyServiceId === serviceId}
                        >
                          {busyServiceId === serviceId ? 'DISCONNECTING...' : 'DISCONNECT'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary">smart_toy</span>
            <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Agent Model</h3>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Orchestrator Model</label>
            <ModelSelector value={selectedModel} onChange={saveModel} />
            <p className="text-[10px] technical-font text-slate-500 opacity-60">The AI model used for the main agent chat.</p>
          </div>
        </section>

        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary">monitor</span>
            <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Display</h3>
          </div>
          <div className="space-y-4">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">App Theme</label>
            <div className="grid grid-cols-3 gap-4">
              {['system', 'light', 'dark'].map((theme) => (
                <button
                  key={theme}
                  id={`theme-${theme}`}
                  type="button"
                  onClick={() => setTheme(theme)}
                  className={`flex flex-col items-center gap-3 p-4 border rounded-lg transition-all ${
                    state.settings.theme === theme ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-slate-500">
                    {theme === 'system' ? 'settings_brightness' : theme === 'light' ? 'light_mode' : 'dark_mode'}
                  </span>
                  <span className="text-[10px] technical-font font-bold text-slate-600 dark:text-slate-400">{theme.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4 mt-8">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Window Mode</label>
            <div className="grid grid-cols-2 gap-4">
              {['windowed', 'fullscreen'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDisplayMode(mode)}
                  className={`flex flex-col items-center gap-3 p-4 border rounded-lg transition-all ${
                    state.settings.displayMode === mode ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-slate-500">{mode === 'windowed' ? 'grid_view' : 'fullscreen'}</span>
                  <span className="text-[10px] technical-font font-bold text-slate-600 dark:text-slate-400">
                    {mode === 'windowed' ? 'WINDOWED' : 'FULL SCREEN'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary">history</span>
            <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Data Polling</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.settings.autoPolling !== false}
                onChange={(e) => updatePolling(e.target.checked, state.settings.pollingInterval)}
                className="form-checkbox h-4 w-4 bg-transparent border-primary text-primary focus:ring-0"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Enable auto refresh</span>
            </label>
            <div className="flex justify-between items-end">
              <label className="text-[10px] technical-font text-slate-500">Refresh interval</label>
              <span className="text-primary font-display font-bold">
                {Math.round((state.settings.pollingInterval || 30000) / 1000)} SECONDS
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="300"
              step="5"
              value={Math.round((state.settings.pollingInterval || 30000) / 1000)}
              onChange={(e) => updatePolling(state.settings.autoPolling !== false, parseInt(e.target.value, 10) * 1000)}
              className="w-full cursor-pointer"
            />
          </div>
        </section>

        <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-2xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="material-symbols-outlined text-primary">system_update</span>
            <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">System</h3>
          </div>
          <div className="flex justify-between items-center gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Update Application</h4>
              <p className="text-[10px] technical-font text-slate-500 mt-1">Pull latest changes from GitHub and restart the application.</p>
            </div>
            <Button id="update-app-btn" variant="primary" onClick={updateApp}>
              <span className="material-symbols-outlined text-sm">download</span>
              UPDATE & RESTART
            </Button>
          </div>
        </section>
      </div>

      <ServiceOnboardingModal
        open={onboardingOpen}
        initialServiceId={activeServiceId}
        requiredConnection={connectedServices.length === 0}
        hasConnectedServices={connectedServices.length > 0}
        state={state}
        api={api}
        loadSettings={loadSettings}
        checkConnectionStatus={checkConnectionStatus}
        onClose={() => setOnboardingOpen(false)}
        onConnected={() => {
          setOnboardingOpen(false);
          setActiveServiceId(null);
        }}
      />
    </>
  );
}
