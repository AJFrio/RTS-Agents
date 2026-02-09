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
        // Ideally reload settings to update list
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
