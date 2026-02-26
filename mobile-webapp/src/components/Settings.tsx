/**
 * Settings Component
 * 
 * API key configuration and app settings
 */

import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { storageService } from '../services/storage-service';
import ModelSelector from './ModelSelector';

interface ApiKeyInputProps {
  label: string;
  placeholder: string;
  hint: string;
  isConfigured: boolean;
  onSave: (key: string) => void;
  onTest: () => Promise<{ success: boolean; error?: string }>;
  onDisconnect: () => void;
}

function ApiKeyInput({
  label,
  placeholder,
  hint,
  isConfigured,
  onSave,
  onTest,
  onDisconnect,
}: ApiKeyInputProps) {
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleSave = () => {
    if (key.trim()) {
      onSave(key.trim());
      setKey('');
      setTestResult(null);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest();
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setTestResult(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={isConfigured ? '••••••••' : placeholder}
          className="flex-1 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm py-2.5 px-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200"
        />
        
        <button
          onClick={handleSave}
          disabled={!key.trim()}
          className="bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          Save
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={!isConfigured || testing}
          className="border border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200"
        >
          {testing ? 'Testing...' : 'Test'}
        </button>
        
        {isConfigured && (
          <button
            onClick={handleDisconnect}
            className="border border-red-900/50 text-red-400 px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-red-900/20 transition-all duration-200"
          >
            Disconnect
          </button>
        )}

        {testResult && (
          <span className={`text-xs ${testResult.success ? 'text-emerald-500' : 'text-red-400'}`}>
            {testResult.success ? 'Connected!' : testResult.error || 'Failed'}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

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

export default function Settings() {
  const { state, dispatch, setApiKey, testApiKey, setCloudflareConfig, testCloudflareConfig, pullKeysFromKV, enableNotifications, setModel } = useApp();
  const { configuredServices, settings } = state;

  const [cfAccountId, setCfAccountId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [cfTesting, setCfTesting] = useState(false);
  const [syncingKeys, setSyncingKeys] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; keysImported?: string[]; error?: string } | null>(null);
  const [cfTestResult, setCfTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleThemeChange = (theme: 'system' | 'light' | 'dark') => {
    dispatch({ type: 'SET_SETTINGS', payload: { theme } });
  };

  const handlePollingToggle = () => {
    dispatch({ type: 'SET_SETTINGS', payload: { autoPolling: !settings.autoPolling } });
  };

  const [jiraBaseUrl, setJiraBaseUrl] = useState(settings.jiraBaseUrl || '');

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10) * 1000;
    dispatch({ type: 'SET_SETTINGS', payload: { pollingInterval: value } });
  };

  const handleSaveJiraBaseUrl = () => {
    dispatch({ type: 'SET_SETTINGS', payload: { jiraBaseUrl: jiraBaseUrl.trim() } });
  };

  const handleSaveCloudflare = () => {
    if (cfAccountId.trim() && cfApiToken.trim()) {
      setCloudflareConfig({
        accountId: cfAccountId.trim(),
        apiToken: cfApiToken.trim(),
      });
      setCfAccountId('');
      setCfApiToken('');
      setCfTestResult(null);
    }
  };

  const handleTestCloudflare = async () => {
    setCfTesting(true);
    setCfTestResult(null);
    try {
      const result = await testCloudflareConfig();
      setCfTestResult(result);
    } catch (err) {
      setCfTestResult({ success: false, error: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setCfTesting(false);
    }
  };

  const handleDisconnectCloudflare = () => {
    // Clear cloudflare config via storage service
    storageService.removeCloudflareConfig();
    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
    setCfTestResult(null);
  };

  const handleDisconnect = (provider: string) => {
    storageService.removeApiKey(provider);
    dispatch({ type: 'SET_CONFIGURED_SERVICES', payload: storageService.getApiKeyStatus() });
  };

  return (
    <div className="p-4 space-y-6">
      {/* API Keys Section */}
      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">key</span>
          <h3 className="text-base font-semibold">API Keys</h3>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Jira Base URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={jiraBaseUrl}
                onChange={(e) => setJiraBaseUrl(e.target.value)}
                placeholder="https://your-domain.atlassian.net"
                className="flex-1 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm py-2.5 px-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200"
              />
              <button
                onClick={handleSaveJiraBaseUrl}
                disabled={!jiraBaseUrl.trim()}
                className="bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-slate-500">Your Jira site URL (no trailing slash)</p>
          </div>

          <ApiKeyInput
            label="Jira API Token / PAT"
            placeholder="Enter Jira API token (or email:token)"
            hint="Cloud: create an API token and paste token, or paste email:token. Data Center: use a Personal Access Token."
            isConfigured={configuredServices.jira}
            onSave={(key) => setApiKey('jira', key)}
            onTest={() => testApiKey('jira')}
            onDisconnect={() => handleDisconnect('jira')}
          />

          <ApiKeyInput
            label="Jules API Key"
            placeholder="Enter Jules API key"
            hint="Get from Jules console settings"
            isConfigured={configuredServices.jules}
            onSave={(key) => setApiKey('jules', key)}
            onTest={() => testApiKey('jules')}
            onDisconnect={() => handleDisconnect('jules')}
          />

          <ApiKeyInput
            label="Cursor Cloud API Key"
            placeholder="Enter Cursor API key"
            hint="Get from cursor.com/settings"
            isConfigured={configuredServices.cursor}
            onSave={(key) => setApiKey('cursor', key)}
            onTest={() => testApiKey('cursor')}
            onDisconnect={() => handleDisconnect('cursor')}
          />

          <ApiKeyInput
            label="OpenAI Codex API Key (Legacy)"
            placeholder="Enter OpenAI API key"
            hint="Get from platform.openai.com/api-keys"
            isConfigured={configuredServices.codex}
            onSave={(key) => setApiKey('codex', key)}
            onTest={() => testApiKey('codex')}
            onDisconnect={() => handleDisconnect('codex')}
          />

          <ApiKeyInput
            label="Anthropic Claude API Key"
            placeholder="Enter Anthropic API key"
            hint="Get from console.anthropic.com"
            isConfigured={configuredServices.claude}
            onSave={(key) => setApiKey('claude', key)}
            onTest={() => testApiKey('claude')}
            onDisconnect={() => handleDisconnect('claude')}
          />

          <ApiKeyInput
            label="OpenRouter API Key"
            placeholder="Enter OpenRouter API key"
            hint="Get from openrouter.ai/keys"
            isConfigured={configuredServices.openrouter}
            onSave={(key) => setApiKey('openrouter', key)}
            onTest={() => testApiKey('openrouter')}
            onDisconnect={() => handleDisconnect('openrouter')}
          />

          <ApiKeyInput
            label="Google Gemini API Key"
            placeholder="Enter Gemini API key"
            hint="Get from aistudio.google.com"
            isConfigured={configuredServices.gemini}
            onSave={(key) => setApiKey('gemini', key)}
            onTest={() => testApiKey('gemini')}
            onDisconnect={() => handleDisconnect('gemini')}
          />

          <ApiKeyInput
            label="GitHub Personal Access Token"
            placeholder="Enter GitHub PAT (repo scope)"
            hint="Get from github.com/settings/tokens"
            isConfigured={configuredServices.github}
            onSave={(key) => setApiKey('github', key)}
            onTest={() => testApiKey('github')}
            onDisconnect={() => handleDisconnect('github')}
          />
        </div>
      </section>

      {/* Cloudflare KV Section */}
      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">cloud</span>
          <h3 className="text-base font-semibold">Cloudflare KV</h3>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Connect to read computers and dispatch remote tasks. The mobile app will not register itself.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Account ID
            </label>
            <input
              type="text"
              value={cfAccountId}
              onChange={(e) => setCfAccountId(e.target.value)}
              placeholder={configuredServices.cloudflare ? '••••••••' : 'Enter Cloudflare Account ID'}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm py-2.5 px-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              API Token
            </label>
            <input
              type="password"
              value={cfApiToken}
              onChange={(e) => setCfApiToken(e.target.value)}
              placeholder={configuredServices.cloudflare ? '••••••••' : 'Enter Cloudflare API token'}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-border-dark rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm py-2.5 px-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all duration-200"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCloudflare}
              disabled={!cfAccountId.trim() || !cfApiToken.trim()}
              className="bg-primary text-black px-4 py-2 text-xs font-semibold rounded-lg shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Save
            </button>

            <button
              onClick={handleTestCloudflare}
              disabled={!configuredServices.cloudflare || cfTesting}
              className="border border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200"
            >
              {cfTesting ? 'Testing...' : 'Test'}
            </button>

            {configuredServices.cloudflare && (
              <button
                onClick={handleDisconnectCloudflare}
                className="border border-red-900/50 text-red-400 px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-red-900/20 transition-all duration-200"
              >
                Disconnect
              </button>
            )}

            {cfTestResult && (
              <span className={`text-xs ${cfTestResult.success ? 'text-emerald-500' : 'text-red-400'}`}>
                {cfTestResult.success ? 'Connected!' : cfTestResult.error || 'Failed'}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Sync Keys from Cloud */}
      {configuredServices.cloudflare && (
        <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">sync</span>
            <h3 className="text-base font-semibold">Sync Keys from Cloud</h3>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Pull API keys from the Cloudflare KV store. Keys must first be pushed from the Electron desktop app.
          </p>

          <div className="space-y-3">
            <button
              onClick={async () => {
                setSyncingKeys(true);
                setSyncResult(null);
                try {
                  const result = await pullKeysFromKV();
                  setSyncResult(result);
                } catch (err) {
                  setSyncResult({ 
                    success: false, 
                    error: err instanceof Error ? err.message : 'Sync failed' 
                  });
                } finally {
                  setSyncingKeys(false);
                }
              }}
              disabled={syncingKeys}
              className="w-full flex items-center justify-center gap-2 bg-primary/20 border border-primary text-primary py-3 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/30 transition-all duration-200"
            >
              <span className={`material-symbols-outlined text-sm ${syncingKeys ? 'animate-spin' : ''}`}>
                {syncingKeys ? 'sync' : 'cloud_download'}
              </span>
              {syncingKeys ? 'Syncing...' : 'Pull Keys from KV Store'}
            </button>

            {syncResult && (
              <div className={`p-3 rounded-lg ${syncResult.success ? 'bg-emerald-500/10 dark:bg-emerald-900/20 border border-emerald-500/50' : 'bg-red-500/10 dark:bg-red-900/20 border border-red-500/50'}`}>
                <div className="flex items-start gap-2">
                  <span className={`material-symbols-outlined text-sm ${syncResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {syncResult.success ? 'check_circle' : 'error'}
                  </span>
                  <div>
                    {syncResult.success ? (
                      <>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">Keys synced successfully!</p>
                        {syncResult.keysImported && syncResult.keysImported.length > 0 ? (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                            Imported: {syncResult.keysImported.join(', ')}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">
                            No new keys found in KV store
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-red-400">{syncResult.error || 'Failed to sync keys'}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Tip: Use "Push Keys to Cloud" in the Electron app's Settings to make keys available here.
            </p>
          </div>
        </section>
      )}

      {/* Model Selection */}
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

      {/* Notifications */}
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

      {/* Display Settings */}
      <section className="bg-white dark:bg-card-dark border border-slate-200 dark:border-border-dark p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">palette</span>
          <h3 className="text-base font-semibold">Display</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`flex flex-col items-center gap-2 p-3 border rounded-lg transition-all duration-200 ${
                    settings.theme === theme
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-slate-200 dark:border-border-dark text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {theme === 'system' ? 'settings_brightness' : theme === 'light' ? 'light_mode' : 'dark_mode'}
                  </span>
                  <span className="text-xs font-medium capitalize">{theme}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Polling Settings */}
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
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Refresh interval
              </label>
              <span className="text-primary font-semibold text-sm">
                {Math.round(settings.pollingInterval / 1000)}s
              </span>
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
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>5s</span>
              <span>5min</span>
            </div>
          </div>
        </div>
      </section>

      {/* App Info */}
      <section className="text-center py-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-lg">grid_view</span>
          <span className="font-semibold text-sm">RTS Agents</span>
        </div>
        <p className="text-xs text-slate-500">Mobile PWA v1.0.0</p>
      </section>
    </div>
  );
}
