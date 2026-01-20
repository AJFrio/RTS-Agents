/**
 * Settings Component
 * 
 * API key configuration and app settings
 */

import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { storageService } from '../services/storage-service';

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
      <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={isConfigured ? '••••••••' : placeholder}
          className="flex-1 bg-black/40 border border-border-dark focus:border-primary focus:outline-none text-sm py-2.5 px-3 text-white placeholder:text-slate-500"
        />
        
        <button
          onClick={handleSave}
          disabled={!key.trim()}
          className="bg-primary text-black px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={!isConfigured || testing}
          className="border border-border-dark text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:text-white hover:border-slate-600 transition-colors"
        >
          {testing ? 'Testing...' : 'Test'}
        </button>
        
        {isConfigured && (
          <button
            onClick={handleDisconnect}
            className="border border-red-900/50 text-red-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider hover:bg-red-900/20 transition-colors"
          >
            Disconnect
          </button>
        )}

        {testResult && (
          <span className={`font-display text-[10px] ${testResult.success ? 'text-emerald-500' : 'text-red-400'}`}>
            {testResult.success ? 'Connected!' : testResult.error || 'Failed'}
          </span>
        )}
      </div>

      <p className="font-display text-[9px] text-slate-600">{hint}</p>
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
        <span className="font-display text-xs font-bold uppercase">Notifications Enabled</span>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <span className="material-symbols-outlined text-sm">block</span>
        <div className="flex flex-col">
            <span className="font-display text-xs font-bold uppercase">Notifications Blocked</span>
            <span className="text-[10px] text-slate-500">Enable in browser settings</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleEnable}
      className="bg-primary text-black px-4 py-2 font-display text-xs font-bold uppercase tracking-wider"
    >
      Enable Notifications
    </button>
  );
}

export default function Settings() {
  const { state, dispatch, setApiKey, testApiKey, setCloudflareConfig, testCloudflareConfig, pullKeysFromKV, enableNotifications } = useApp();
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

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10) * 1000;
    dispatch({ type: 'SET_SETTINGS', payload: { pollingInterval: value } });
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
      <section className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">key</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">API Keys</h3>
        </div>

        <div className="space-y-6">
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
            label="OpenAI Codex API Key"
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
      <section className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">cloud</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Cloudflare KV</h3>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Connect to read computers and dispatch remote tasks. The mobile app will not register itself.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              Account ID
            </label>
            <input
              type="text"
              value={cfAccountId}
              onChange={(e) => setCfAccountId(e.target.value)}
              placeholder={configuredServices.cloudflare ? '••••••••' : 'Enter Cloudflare Account ID'}
              className="w-full bg-black/40 border border-border-dark focus:border-primary focus:outline-none text-sm py-2.5 px-3 text-white placeholder:text-slate-500"
            />
          </div>

          <div>
            <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              API Token
            </label>
            <input
              type="password"
              value={cfApiToken}
              onChange={(e) => setCfApiToken(e.target.value)}
              placeholder={configuredServices.cloudflare ? '••••••••' : 'Enter Cloudflare API token'}
              className="w-full bg-black/40 border border-border-dark focus:border-primary focus:outline-none text-sm py-2.5 px-3 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveCloudflare}
              disabled={!cfAccountId.trim() || !cfApiToken.trim()}
              className="bg-primary text-black px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>

            <button
              onClick={handleTestCloudflare}
              disabled={!configuredServices.cloudflare || cfTesting}
              className="border border-border-dark text-slate-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:text-white hover:border-slate-600 transition-colors"
            >
              {cfTesting ? 'Testing...' : 'Test'}
            </button>

            {configuredServices.cloudflare && (
              <button
                onClick={handleDisconnectCloudflare}
                className="border border-red-900/50 text-red-400 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider hover:bg-red-900/20 transition-colors"
              >
                Disconnect
              </button>
            )}

            {cfTestResult && (
              <span className={`font-display text-[10px] ${cfTestResult.success ? 'text-emerald-500' : 'text-red-400'}`}>
                {cfTestResult.success ? 'Connected!' : cfTestResult.error || 'Failed'}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Sync Keys from Cloud */}
      {configuredServices.cloudflare && (
        <section className="bg-card-dark border border-border-dark p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-lg">sync</span>
            <h3 className="font-display text-sm font-bold uppercase tracking-tight">Sync Keys from Cloud</h3>
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
              className="w-full flex items-center justify-center gap-2 bg-primary/20 border border-primary text-primary py-3 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/30 transition-colors"
            >
              <span className={`material-symbols-outlined text-sm ${syncingKeys ? 'animate-spin' : ''}`}>
                {syncingKeys ? 'sync' : 'cloud_download'}
              </span>
              {syncingKeys ? 'Syncing...' : 'Pull Keys from KV Store'}
            </button>

            {syncResult && (
              <div className={`p-3 ${syncResult.success ? 'bg-emerald-900/20 border border-emerald-500/50' : 'bg-red-900/20 border border-red-500/50'}`}>
                <div className="flex items-start gap-2">
                  <span className={`material-symbols-outlined text-sm ${syncResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {syncResult.success ? 'check_circle' : 'error'}
                  </span>
                  <div>
                    {syncResult.success ? (
                      <>
                        <p className="text-xs text-emerald-300 font-bold">Keys synced successfully!</p>
                        {syncResult.keysImported && syncResult.keysImported.length > 0 ? (
                          <p className="text-xs text-emerald-400 mt-1">
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

            <p className="font-display text-[9px] text-slate-600">
              Tip: Use "Push Keys to Cloud" in the Electron app's Settings to make keys available here.
            </p>
          </div>
        </section>
      )}

      {/* Notifications */}
      <section className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">notifications</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Notifications</h3>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Enable native notifications to get alerted when tasks are ready for review.
        </p>

        <NotificationSettings enableNotifications={enableNotifications} />
      </section>

      {/* Display Settings */}
      <section className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">palette</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Display</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block font-display text-[10px] text-slate-500 uppercase tracking-wider mb-2">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['system', 'light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`flex flex-col items-center gap-2 p-3 border transition-colors ${
                    settings.theme === theme
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border-dark text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {theme === 'system' ? 'settings_brightness' : theme === 'light' ? 'light_mode' : 'dark_mode'}
                  </span>
                  <span className="font-display text-[10px] font-bold uppercase">{theme}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Polling Settings */}
      <section className="bg-card-dark border border-border-dark p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">schedule</span>
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Data Polling</h3>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoPolling}
              onChange={handlePollingToggle}
              className="w-4 h-4 bg-transparent border-primary text-primary focus:ring-0 focus:ring-offset-0"
            />
            <span className="font-display text-xs text-slate-300">Enable auto refresh</span>
          </label>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="font-display text-[10px] text-slate-500 uppercase tracking-wider">
                Refresh interval
              </label>
              <span className="text-primary font-display font-bold text-sm">
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
              className="w-full h-1 bg-border-dark appearance-none cursor-pointer disabled:opacity-50"
            />
            <div className="flex justify-between text-[9px] font-display text-slate-600 mt-1">
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
          <span className="font-display font-bold text-sm uppercase tracking-tight">RTS Agents</span>
        </div>
        <p className="font-display text-[10px] text-slate-500">Mobile PWA v1.0.0</p>
      </section>
    </div>
  );
}
