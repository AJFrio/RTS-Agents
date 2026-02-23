import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import ApiKeyRow from '../components/settings/ApiKeyRow.jsx';
import PathRow from '../components/settings/PathRow.jsx';
import ModelSelector from '../components/settings/ModelSelector.jsx';
import Button from '../components/ui/Button.jsx';

const CLOUD_KEYS = [
  { id: 'jules', label: 'Jules API Key', placeholder: 'Enter Jules API key', hint: 'Get from Jules console settings' },
  { id: 'cursor', label: 'Cursor Cloud API Key', placeholder: 'Enter Cursor API key', hint: 'Get from cursor.com/settings' },
  { id: 'github', label: 'GitHub Personal Access Token', placeholder: 'Enter GitHub PAT (repo scope)', hint: 'Get from github.com/settings/tokens (classic)' },
  { id: 'jira', label: 'Jira API Token / PAT', placeholder: "Enter 'email:token' (Cloud) or PAT (Server)", hint: 'Cloud: email:token. Data Center: Personal Access Token.' },
];

const MODEL_KEYS = [
  { id: 'openrouter', label: 'OpenRouter API Key', placeholder: 'Enter OpenRouter API key', hint: 'Get from openrouter.ai/keys' },
  { id: 'claude', label: 'Anthropic Claude API Key', placeholder: 'Enter Anthropic API key', hint: 'Get from console.anthropic.com' },
  { id: 'openai', label: 'OpenAI API Key (Orchestrator)', placeholder: 'Enter OpenAI API key', hint: 'Get from platform.openai.com/api-keys' },
  { id: 'gemini', label: 'Google Gemini API Key', placeholder: 'Enter Gemini API key', hint: 'Get from aistudio.google.com' },
  { id: 'codex', label: 'OpenAI Codex API Key (Legacy)', placeholder: 'Enter OpenAI API key', hint: 'Get from platform.openai.com/api-keys' },
];

const STATUS_KEYS = ['gemini', 'jules', 'cursor', 'codex', 'openai', 'openrouter', 'claude-cli', 'claude-cloud', 'github'];

function statusText(s) {
  if (!s) return 'STBY';
  if (s.success || s.connected) return 'Connected';
  if (s.error === 'Not configured') return 'Offline';
  return 'Error';
}

function statusClass(s) {
  if (!s) return 'font-semibold text-slate-500';
  if (s.success || s.connected) return 'font-bold text-emerald-500';
  if (s.error === 'Not configured') return 'font-bold text-slate-500';
  return 'font-bold text-red-500';
}

export default function SettingsPage() {
  const { state, dispatch, api, loadSettings } = useApp();
  const { settings, configuredServices, connectionStatus, computers } = state;
  const [jiraBaseUrl, setJiraBaseUrl] = useState(settings.jiraBaseUrl || '');
  const [keyValues, setKeyValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareToken, setCloudflareToken] = useState('');
  const [newGithubPath, setNewGithubPath] = useState('');
  const [selectedModel, setSelectedModel] = useState(settings.selectedModel || 'openrouter/openai/gpt-4o');

  useEffect(() => {
    if (settings.selectedModel) {
      setSelectedModel(settings.selectedModel);
    }
  }, [settings.selectedModel]);

  const saveModel = useCallback(async (model) => {
    setSelectedModel(model);
    if (api?.setModel) {
      await api.setModel(model);
      dispatch({ type: 'SET_SETTINGS', payload: { selectedModel: model } });
    }
  }, [api, dispatch]);

  // Cloudflare state
  const [pushingKeys, setPushingKeys] = useState(false);
  const [pullingKeys, setPullingKeys] = useState(false);
  const [saveButtonText, setSaveButtonText] = useState('SAVE');
  const [pushButtonText, setPushButtonText] = useState('PUSH KEYS');
  const [pullButtonText, setPullButtonText] = useState('PULL KEYS');

  const isCloudflareConfigured = computers?.configured;

  const saveJiraBaseUrl = useCallback(async () => {
    const url = jiraBaseUrl.trim();
    if (!url || !api?.setJiraBaseUrl) return;
    setSaving(true);
    try {
      await api.setJiraBaseUrl(url);
      dispatch({ type: 'SET_SETTINGS', payload: { jiraBaseUrl: url } });
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }, [jiraBaseUrl, api, dispatch, loadSettings]);

  const saveApiKey = useCallback(async (provider) => {
    const key = (keyValues[provider] || '').trim();
    if (!key || !api?.setApiKey) return;
    setSaving(true);
    try {
      await api.setApiKey(provider, key);
      setKeyValues((prev) => ({ ...prev, [provider]: '' }));
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }, [keyValues, api, loadSettings]);

  const testApiKey = useCallback(async (provider) => {
    if (!api?.testApiKey) return;
    setSaving(true);
    try {
      await api.testApiKey(provider);
    } finally {
      setSaving(false);
    }
  }, [api]);

  const disconnectApiKey = useCallback(async (provider) => {
    if (!api?.removeApiKey) return;
    setSaving(true);
    try {
      await api.removeApiKey(provider);
      await loadSettings();
    } finally {
      setSaving(false);
    }
  }, [api, loadSettings]);

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

  const saveCloudflare = useCallback(async () => {
    if (!api?.setCloudflareConfig) return;
    setSaving(true);
    setSaveButtonText('SAVING...');
    try {
      await api.setCloudflareConfig(cloudflareAccountId, cloudflareToken);
      await loadSettings();
      setSaveButtonText('SAVED!');
      setCloudflareAccountId('');
      setCloudflareToken('');
      setTimeout(() => setSaveButtonText('SAVE'), 2000);
    } catch (err) {
      console.error(err);
      setSaveButtonText('ERROR');
      setTimeout(() => setSaveButtonText('SAVE'), 2000);
    } finally {
      setSaving(false);
    }
  }, [api, cloudflareAccountId, cloudflareToken, loadSettings]);

  const unlinkCloudflare = useCallback(async () => {
    if (!api?.clearCloudflareConfig) return;
    setSaving(true);
    try {
      await api.clearCloudflareConfig();
      await loadSettings();
      setCloudflareAccountId('');
      setCloudflareToken('');
    } finally {
      setSaving(false);
    }
  }, [api, loadSettings]);

  const pushKeys = useCallback(async () => {
    if (!api?.pushKeysToCloudflare) return;
    setPushingKeys(true);
    setPushButtonText('PUSHING...');
    try {
      await api.pushKeysToCloudflare();
      setPushButtonText('PUSHED!');
      setTimeout(() => setPushButtonText('PUSH KEYS'), 2000);
    } catch (err) {
      console.error(err);
      setPushButtonText('ERROR');
      setTimeout(() => setPushButtonText('PUSH KEYS'), 2000);
    } finally {
      setPushingKeys(false);
    }
  }, [api]);

  const pullKeys = useCallback(async () => {
    if (!api?.pullKeysFromCloudflare) return;
    setPullingKeys(true);
    setPullButtonText('PULLING...');
    try {
      await api.pullKeysFromCloudflare();
      await loadSettings();
      setPullButtonText('PULLED!');
      setTimeout(() => setPullButtonText('PULL KEYS'), 2000);
    } catch (err) {
      console.error(err);
      setPullButtonText('ERROR');
      setTimeout(() => setPullButtonText('PULL KEYS'), 2000);
    } finally {
      setPullingKeys(false);
    }
  }, [api, loadSettings]);

  const updateApp = useCallback(() => {
    api?.updateApp?.();
  }, [api]);

  return (
    <div id="view-settings" className="view-content max-w-4xl mx-auto w-full space-y-8">
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">key</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Cloud Service Keys</h3>
        </div>
        <div className="space-y-8">
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Jira Base URL</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="text"
                value={jiraBaseUrl}
                onChange={(e) => setJiraBaseUrl(e.target.value)}
                placeholder="https://your-domain.atlassian.net"
                className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-lg text-sm py-2.5 px-4 text-slate-800 dark:text-white"
              />
              <Button variant="primary" onClick={saveJiraBaseUrl} disabled={saving}>SAVE</Button>
            </div>
            <p className="text-[10px] technical-font text-slate-500 opacity-60">Your Jira site URL (no trailing slash)</p>
          </div>
          {CLOUD_KEYS.map(({ id, label, placeholder, hint }) => (
            <ApiKeyRow
              key={id}
              id={`${id}-api-key`}
              label={label}
              placeholder={placeholder}
              hint={hint}
              value={keyValues[id] ?? ''}
              onChange={(v) => setKeyValues((prev) => ({ ...prev, [id]: v }))}
              onSave={() => saveApiKey(id)}
              onTest={() => testApiKey(id)}
              onDisconnect={() => disconnectApiKey(id)}
              configured={configuredServices[id]}
              saving={saving}
            />
          ))}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Cloudflare Account ID</label>
            <input
              id="cloudflare-account-id"
              type="text"
              value={cloudflareAccountId}
              onChange={(e) => setCloudflareAccountId(e.target.value)}
              placeholder={isCloudflareConfigured ? '••••••••••••••••' : "Enter Cloudflare Account ID"}
              className="flex-1 w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg text-sm py-2.5 px-4 text-slate-800 dark:text-white"
            />
            <p className="text-[10px] technical-font text-slate-500 opacity-60">Used for Cloudflare KV (computers registry)</p>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Cloudflare API Token</label>
            <div className="flex gap-2">
              <input
                id="cloudflare-api-token"
                type="password"
                value={cloudflareToken}
                onChange={(e) => setCloudflareToken(e.target.value)}
                placeholder={isCloudflareConfigured ? '••••••••••••••••' : "Enter Cloudflare API token"}
                className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg text-sm py-2.5 px-4 text-slate-800 dark:text-white"
              />
              <Button variant="primary" onClick={saveCloudflare} disabled={saving}>{saveButtonText}</Button>
              <Button variant="secondary" onClick={async () => { if (api?.testCloudflare) await api.testCloudflare(); }} disabled={saving}>TEST</Button>
              {isCloudflareConfigured && (
                <button
                  type="button"
                  onClick={unlinkCloudflare}
                  className="border border-red-900/50 text-red-400 px-4 py-2.5 text-[10px] technical-font font-bold hover:bg-red-900/20 flex items-center gap-1 rounded-lg transition-all"
                >
                  <span className="material-symbols-outlined text-sm">link_off</span>
                </button>
              )}
            </div>
            <p className="text-[10px] technical-font text-slate-500 opacity-60">Create an API token with KV permissions</p>
          </div>

          {isCloudflareConfigured && (
            <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-border-dark">
              <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Key Synchronization (KV Store)</label>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={pushKeys} disabled={pushingKeys}>
                  <span className="material-symbols-outlined text-sm mr-1">cloud_upload</span>
                  {pushButtonText}
                </Button>
                <Button variant="secondary" onClick={pullKeys} disabled={pullingKeys}>
                  <span className="material-symbols-outlined text-sm mr-1">cloud_download</span>
                  {pullButtonText}
                </Button>
              </div>
              <p className="text-[10px] technical-font text-slate-500 opacity-60">Sync API keys across devices using Cloudflare KV.</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">smart_toy</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Agent Model Keys</h3>
        </div>
        <div className="space-y-8">
          {MODEL_KEYS.map(({ id, label, placeholder, hint }) => (
            <ApiKeyRow
              key={id}
              id={`${id}-api-key`}
              label={label}
              placeholder={placeholder}
              hint={hint}
              value={keyValues[id] ?? ''}
              onChange={(v) => setKeyValues((prev) => ({ ...prev, [id]: v }))}
              onSave={() => saveApiKey(id)}
              onTest={() => testApiKey(id)}
              onDisconnect={() => disconnectApiKey(id)}
              configured={configuredServices[id]}
              saving={saving}
            />
          ))}
        </div>
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
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

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
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
                type="button"
                onClick={() => setTheme(theme)}
                className={`flex flex-col items-center gap-3 p-4 border rounded-lg transition-all ${
                  settings.theme === theme ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary'
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
                  settings.displayMode === mode ? 'border-primary bg-primary/10' : 'border-slate-200 dark:border-border-dark hover:border-primary'
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

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">history</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Data Polling</h3>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoPolling !== false}
              onChange={(e) => updatePolling(e.target.checked, settings.pollingInterval)}
              className="form-checkbox h-4 w-4 bg-transparent border-primary text-primary focus:ring-0"
            />
            <span className="text-sm technical-font text-slate-300">Enable auto refresh</span>
          </label>
          <div className="flex justify-between items-end">
            <label className="text-[10px] technical-font text-slate-500">Refresh interval</label>
            <span className="text-primary font-display font-bold">
              {Math.round((settings.pollingInterval || 30000) / 1000)} SECONDS
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="300"
            step="5"
            value={Math.round((settings.pollingInterval || 30000) / 1000)}
            onChange={(e) => updatePolling(settings.autoPolling !== false, parseInt(e.target.value, 10) * 1000)}
            className="w-full cursor-pointer"
          />
        </div>
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">source</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">GitHub Repository Paths</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4 technical-font">
          Add paths to folders containing your Git repositories. CLI tools will scan these for available projects.
        </p>
        <PathRow
          label="Add path"
          placeholder="e.g., D:\GitHub or ~/projects..."
          value={newGithubPath}
          onChange={setNewGithubPath}
          paths={settings.githubPaths || []}
          onAdd={async () => {
            const p = newGithubPath.trim();
            if (p && api?.addGithubPath) {
              await api.addGithubPath(p);
              setNewGithubPath('');
              await loadSettings();
            }
          }}
          onBrowse={async () => {
            const p = await api?.openDirectory?.();
            if (p && api?.addGithubPath) {
              await api.addGithubPath(p);
              await loadSettings();
            }
          }}
          onRemove={async (path) => {
            if (api?.removeGithubPath) {
              await api.removeGithubPath(path);
              await loadSettings();
            }
          }}
        />
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">monitor_heart</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Health Check</h3>
        </div>
        <div className="space-y-4">
          {STATUS_KEYS.map((key) => (
            <div key={key} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-border-dark py-3 last:border-0">
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                {key === 'claude-cli' ? 'Claude CLI' : key === 'claude-cloud' ? 'Claude Cloud' : key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <span className={statusClass(connectionStatus[key])} title={connectionStatus[key]?.error}>
                {statusText(connectionStatus[key])}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">system_update</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">System</h3>
        </div>
        <div className="flex justify-between items-center">
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
  );
}
