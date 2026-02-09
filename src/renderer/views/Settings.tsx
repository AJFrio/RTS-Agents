import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const Settings: React.FC = () => {
  const { settings, updateSettings, configuredServices } = useApp();

  // Local state for inputs to allow typing before saving
  const [inputs, setInputs] = useState<Record<string, string>>({
    jiraBaseUrl: settings.jiraBaseUrl || '',
    jiraApiKey: '',
    julesApiKey: '',
    cursorApiKey: '',
    codexApiKey: '',
    claudeApiKey: '',
    githubApiKey: '',
    cloudflareAccountId: '',
    cloudflareApiToken: '',
    newGeminiPath: '',
    newClaudePath: '',
    newCursorPath: '',
    newCodexPath: '',
    newGithubPath: ''
  });

  const handleInputChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const saveApiKey = async (provider: string, key: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setApiKey(provider, key);
      handleInputChange(`${provider}ApiKey`, ''); // Clear input
      // Refresh settings handled by context or we can trigger it
      alert(`${provider.toUpperCase()} API Key saved`);
    } catch (err) {
      alert(`Failed to save key: ${err}`);
    }
  };

  const saveJiraBaseUrl = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setJiraBaseUrl(inputs.jiraBaseUrl);
      updateSettings({ jiraBaseUrl: inputs.jiraBaseUrl });
      alert('Jira Base URL saved');
    } catch (err) {
      alert(`Failed to save URL: ${err}`);
    }
  };

  const saveCloudflareConfig = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setCloudflareConfig(inputs.cloudflareAccountId, inputs.cloudflareApiToken);
      handleInputChange('cloudflareApiToken', '');
      alert('Cloudflare settings saved');
    } catch (err) {
      alert(`Failed to save Cloudflare config: ${err}`);
    }
  };

  const setTheme = async (theme: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setTheme(theme);
      updateSettings({ theme });
    } catch (err) {
      console.error(err);
    }
  };

  const setDisplayMode = async (mode: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setDisplayMode(mode);
      updateSettings({ displayMode: mode });
    } catch (err) {
      console.error(err);
    }
  };

  const setPolling = async (enabled: boolean, interval: number) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setPolling(enabled, interval);
      updateSettings({ autoPolling: enabled, pollingInterval: interval });
    } catch (err) {
      console.error(err);
    }
  };

  const addPath = async (type: 'gemini' | 'claude' | 'cursor' | 'codex' | 'github', path: string) => {
    if (!window.electronAPI || !path) return;
    try {
      let result;
      switch (type) {
        case 'gemini': result = await window.electronAPI.addGeminiPath(path); break;
        case 'claude': result = await window.electronAPI.addClaudePath(path); break;
        case 'cursor': result = await window.electronAPI.addCursorPath(path); break;
        case 'codex': result = await window.electronAPI.addCodexPath(path); break;
        case 'github': result = await window.electronAPI.addGithubPath(path); break;
      }
      if (result && result.success) {
        handleInputChange(`new${type.charAt(0).toUpperCase() + type.slice(1)}Path`, '');
        const pathsKey = `${type}Paths` as keyof typeof settings;
        updateSettings({ [pathsKey]: result.paths });
      }
    } catch (err) {
      alert(`Failed to add path: ${err}`);
    }
  };

  const removePath = async (type: 'gemini' | 'claude' | 'cursor' | 'codex' | 'github', path: string) => {
    if (!window.electronAPI) return;
    try {
      let result;
      switch (type) {
        case 'gemini': result = await window.electronAPI.removeGeminiPath(path); break;
        case 'claude': result = await window.electronAPI.removeClaudePath(path); break;
        case 'cursor': result = await window.electronAPI.removeCursorPath(path); break;
        case 'codex': result = await window.electronAPI.removeCodexPath(path); break;
        case 'github': result = await window.electronAPI.removeGithubPath(path); break;
      }
      if (result && result.success) {
        const pathsKey = `${type}Paths` as keyof typeof settings;
        updateSettings({ [pathsKey]: result.paths });
      }
    } catch (err) {
      alert(`Failed to remove path: ${err}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-10">
      {/* API Keys Section */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">key</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">API Command Keys</h3>
        </div>

        <div className="space-y-8">
          {/* Jira */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Jira Base URL</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="text"
                placeholder="https://your-domain.atlassian.net"
                value={inputs.jiraBaseUrl}
                onChange={(e) => handleInputChange('jiraBaseUrl', e.target.value)}
                className="flex-1"
              />
              <button onClick={saveJiraBaseUrl} className="btn-primary">SAVE</button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Jira API Token</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices.jira ? "••••••••••••••••" : "Enter token"}
                value={inputs.jiraApiKey}
                onChange={(e) => handleInputChange('jiraApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('jira', inputs.jiraApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* Jules */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Jules API Key</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices.jules ? "••••••••••••••••" : "Enter key"}
                value={inputs.julesApiKey}
                onChange={(e) => handleInputChange('julesApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('jules', inputs.julesApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* Cursor */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Cursor Cloud API Key</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices.cursor ? "••••••••••••••••" : "Enter key"}
                value={inputs.cursorApiKey}
                onChange={(e) => handleInputChange('cursorApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('cursor', inputs.cursorApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* Codex */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">OpenAI Codex API Key</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices.codex ? "••••••••••••••••" : "Enter key"}
                value={inputs.codexApiKey}
                onChange={(e) => handleInputChange('codexApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('codex', inputs.codexApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* Claude */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Anthropic Claude API Key</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices['claude-cloud'] ? "••••••••••••••••" : "Enter key"}
                value={inputs.claudeApiKey}
                onChange={(e) => handleInputChange('claudeApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('claude', inputs.claudeApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* GitHub */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">GitHub Token</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder={configuredServices.github ? "••••••••••••••••" : "Enter token"}
                value={inputs.githubApiKey}
                onChange={(e) => handleInputChange('githubApiKey', e.target.value)}
                className="flex-1"
              />
              <button onClick={() => saveApiKey('github', inputs.githubApiKey)} className="btn-primary">SAVE</button>
            </div>
          </div>

          {/* Cloudflare */}
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Cloudflare Account ID</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="text"
                placeholder="Account ID"
                value={inputs.cloudflareAccountId}
                onChange={(e) => handleInputChange('cloudflareAccountId', e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Cloudflare API Token</label>
            <div className="flex gap-2 inner-glow">
              <input
                type="password"
                placeholder="Enter Cloudflare API token"
                value={inputs.cloudflareApiToken}
                onChange={(e) => handleInputChange('cloudflareApiToken', e.target.value)}
                className="flex-1"
              />
              <button onClick={saveCloudflareConfig} className="btn-primary">SAVE</button>
            </div>
          </div>
        </div>
      </section>

      {/* Display Settings */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">monitor</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Display</h3>
        </div>

        <div className="space-y-4">
          <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">App Theme</label>
          <div className="grid grid-cols-3 gap-4">
            {['system', 'light', 'dark'].map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex flex-col items-center gap-3 p-4 border transition-all rounded-lg ${settings.theme === t ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-border-dark hover:border-primary'}`}
              >
                <span className={`material-symbols-outlined ${settings.theme === t ? 'text-primary' : 'text-slate-500'}`}>
                  {t === 'system' ? 'settings_brightness' : t === 'light' ? 'light_mode' : 'dark_mode'}
                </span>
                <span className={`text-[10px] technical-font font-bold ${settings.theme === t ? 'text-primary' : 'text-slate-600 dark:text-slate-400'}`}>
                  {t.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <label className="block text-[10px] technical-font text-slate-500 dark:text-slate-400">Window Mode</label>
          <div className="grid grid-cols-2 gap-4">
            {['windowed', 'fullscreen'].map((m) => (
              <button
                key={m}
                onClick={() => setDisplayMode(m)}
                className={`flex flex-col items-center gap-3 p-4 border transition-all rounded-lg ${settings.displayMode === m ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-border-dark hover:border-primary'}`}
              >
                <span className={`material-symbols-outlined ${settings.displayMode === m ? 'text-primary' : 'text-slate-500'}`}>
                  {m === 'windowed' ? 'grid_view' : 'fullscreen'}
                </span>
                <span className={`text-[10px] technical-font font-bold ${settings.displayMode === m ? 'text-primary' : 'text-slate-600 dark:text-slate-400'}`}>
                  {m === 'fullscreen' ? 'FULL SCREEN' : 'WINDOWED'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Data Polling */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">history</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">Data Polling</h3>
        </div>

        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="auto-polling"
              checked={settings.autoPolling}
              onChange={(e) => setPolling(e.target.checked, settings.pollingInterval)}
              className="form-checkbox h-4 w-4 bg-transparent border-primary text-primary focus:ring-0"
            />
            <label className="text-sm technical-font text-slate-300 cursor-pointer" htmlFor="auto-polling">Enable auto refresh</label>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-[10px] technical-font text-slate-500">Refresh interval</label>
              <span className="text-primary font-display font-bold">{Math.round(settings.pollingInterval / 1000)} SECONDS</span>
            </div>
            <input
              type="range"
              min="5"
              max="300"
              value={Math.round(settings.pollingInterval / 1000)}
              onChange={(e) => setPolling(settings.autoPolling, parseInt(e.target.value) * 1000)}
              className="w-full cursor-pointer"
            />
            <div className="flex justify-between text-[9px] technical-font text-slate-600">
              <span>5S (MIN)</span>
              <span>5MIN (MAX)</span>
            </div>
          </div>
        </div>
      </section>

      {/* CLI Tools Paths */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">terminal</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">CLI Tools Paths</h3>
        </div>

        <div className="space-y-8">
          {/* Helper function to render path inputs */}
          {[
            { id: 'gemini', label: 'Gemini CLI', statePath: 'newGeminiPath', paths: settings.geminiPaths },
            { id: 'claude', label: 'Claude CLI', statePath: 'newClaudePath', paths: settings.claudePaths },
            { id: 'cursor', label: 'Cursor CLI', statePath: 'newCursorPath', paths: settings.cursorPaths },
            { id: 'codex', label: 'Codex CLI', statePath: 'newCodexPath', paths: settings.codexPaths }
          ].map((tool) => (
            <div key={tool.id}>
              <h4 className="text-sm font-bold text-slate-300 uppercase mb-4">{tool.label}</h4>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder={`Path to ${tool.label}...`}
                  value={inputs[tool.statePath]}
                  onChange={(e) => handleInputChange(tool.statePath, e.target.value)}
                  className="flex-1"
                />
                <button onClick={() => addPath(tool.id as any, inputs[tool.statePath])} className="btn-primary">ADD</button>
              </div>
              <div className="space-y-2">
                {tool.paths.map(path => (
                  <div key={path} className="flex items-center justify-between p-3 bg-slate-700/20 border border-border-dark rounded-lg">
                    <span className="text-sm text-slate-300 font-mono truncate">{path}</span>
                    <button onClick={() => removePath(tool.id as any, path)} className="text-slate-400 hover:text-red-400">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GitHub Paths */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">source</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">GitHub Repository Paths</h3>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="e.g., ~/projects"
            value={inputs.newGithubPath}
            onChange={(e) => handleInputChange('newGithubPath', e.target.value)}
            className="flex-1"
          />
          <button onClick={() => addPath('github', inputs.newGithubPath)} className="btn-primary">ADD</button>
        </div>

        <div className="space-y-2">
          {settings.githubPaths.map(path => (
            <div key={path} className="flex items-center justify-between p-3 bg-slate-700/20 border border-border-dark rounded-lg">
              <span className="text-sm text-slate-300 font-mono truncate">{path}</span>
              <button onClick={() => removePath('github', path)} className="text-slate-400 hover:text-red-400">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* System */}
      <section className="bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-border-dark p-8 rounded-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="material-symbols-outlined text-primary">system_update</span>
          <h3 className="text-lg font-bold dark:text-white uppercase tracking-tight">System</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Update Application</h4>
            <p className="text-[10px] technical-font text-slate-500 mt-1">Pull latest changes and restart.</p>
          </div>
          <button
            onClick={() => window.electronAPI?.updateApp()}
            className="btn-primary flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            UPDATE & RESTART
          </button>
        </div>
      </section>
    </div>
  );
};

export default Settings;
