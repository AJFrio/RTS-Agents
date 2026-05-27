const Store = require('electron-store');
const os = require('os');
const crypto = require('crypto');
const { upsertItem } = require('../utils/collection-utils');
const { schema } = require('./config-schema');
const pathRegistry = require('./config-path-registry');

class ConfigStore {
  constructor() {
    this.store = new Store({
      name: 'rts-agents-config',
      schema,
      encryptionKey: 'rts-agents-v1-secure-key',
      clearInvalidConfig: true
    });
  }

  // API Keys
  getApiKey(provider) {
    return this.store.get(`apiKeys.${provider}`, '');
  }

  setApiKey(provider, key) {
    this.store.set(`apiKeys.${provider}`, key);
  }

  removeApiKey(provider) {
    this.store.set(`apiKeys.${provider}`, '');
  }

  getAllApiKeys() {
    return this.store.get('apiKeys', {});
  }

  // Cloudflare KV config
  getCloudflareConfig() {
    return this.store.get('cloudflare', {});
  }

  setCloudflareConfig({ accountId, apiToken, namespaceId, namespaceTitle } = {}) {
    const current = this.getCloudflareConfig();
    const next = {
      ...current,
      ...(typeof accountId === 'string' ? { accountId } : {}),
      ...(typeof apiToken === 'string' ? { apiToken } : {}),
      ...(typeof namespaceId === 'string' ? { namespaceId } : {}),
      ...(typeof namespaceTitle === 'string' ? { namespaceTitle } : {})
    };
    this.store.set('cloudflare', next);
    return next;
  }

  clearCloudflareConfig() {
    this.store.set('cloudflare', {});
  }

  hasCloudflareConfig() {
    const cfg = this.getCloudflareConfig();
    return !!(cfg?.accountId && cfg?.apiToken);
  }

  // Device identity (stable per machine)
  getOrCreateDeviceIdentity() {
    const current = this.store.get('device', {}) || {};
    let id = current.id;
    let name = current.name;

    if (!id) {
      id = crypto.randomUUID();
    }
    if (!name) {
      name = os.hostname() || 'unknown-device';
    }

    const next = { id, name };
    this.store.set('device', next);
    return next;
  }

  // Settings
  getSetting(key) {
    return this.store.get(`settings.${key}`);
  }

  setSetting(key, value) {
    this.store.set(`settings.${key}`, value);
  }

  getAllSettings() {
    return this.store.get('settings', {});
  }

  getFilters() {
    return this.store.get('settings.filters', {});
  }

  setFilters(filters) {
    this.store.set('settings.filters', filters);
  }

  getSelectedModel() {
    return this.store.get('settings.selectedModel', 'openrouter/openai/gpt-4o');
  }

  setSelectedModel(model) {
    this.store.set('settings.selectedModel', model);
  }

  getJiraBaseUrl() {
    return this.store.get('settings.jiraBaseUrl', '');
  }

  setJiraBaseUrl(url) {
    this.store.set('settings.jiraBaseUrl', url);
  }

  getDisplayMode() {
    return this.store.get('settings.displayMode', 'fullscreen');
  }

  setDisplayMode(mode) {
    this.store.set('settings.displayMode', mode);
  }

  // Project paths (all providers)
  getProjectPaths(provider) {
    return pathRegistry.getPaths(this.store, provider);
  }

  addProjectPath(provider, path) {
    return pathRegistry.addPath(this.store, provider, path);
  }

  removeProjectPath(provider, path) {
    return pathRegistry.removePath(this.store, provider, path);
  }

  getProjectPathsByProvider() {
    return pathRegistry.getPathsByProvider(this.store);
  }

  getGeminiPaths() {
    return this.getProjectPaths('gemini');
  }

  addGeminiPath(path) {
    return this.addProjectPath('gemini', path);
  }

  removeGeminiPath(path) {
    return this.removeProjectPath('gemini', path);
  }

  getClaudePaths() {
    return this.getProjectPaths('claude');
  }

  addClaudePath(path) {
    return this.addProjectPath('claude', path);
  }

  removeClaudePath(path) {
    return this.removeProjectPath('claude', path);
  }

  getCursorPaths() {
    return this.getProjectPaths('cursor');
  }

  addCursorPath(path) {
    return this.addProjectPath('cursor', path);
  }

  removeCursorPath(path) {
    return this.removeProjectPath('cursor', path);
  }

  getCodexPaths() {
    return this.getProjectPaths('codex');
  }

  addCodexPath(path) {
    return this.addProjectPath('codex', path);
  }

  removeCodexPath(path) {
    return this.removeProjectPath('codex', path);
  }

  getGithubPaths() {
    return this.getProjectPaths('github');
  }

  addGithubPath(path) {
    return this.addProjectPath('github', path);
  }

  removeGithubPath(path) {
    return this.removeProjectPath('github', path);
  }

  getAllProjectPaths() {
    return pathRegistry.getAllProjectPaths(this.store);
  }

  // Polling settings
  getPollingInterval() {
    return this.store.get('settings.pollingInterval', 30000);
  }

  setPollingInterval(interval) {
    this.store.set('settings.pollingInterval', Math.max(5000, Math.min(300000, interval)));
  }

  isAutoPollingEnabled() {
    return this.store.get('settings.autoPolling', true);
  }

  setAutoPolling(enabled) {
    this.store.set('settings.autoPolling', enabled);
  }

  getFullConfig() {
    return {
      apiKeys: this.getAllApiKeys(),
      settings: this.getAllSettings()
    };
  }

  hasApiKey(provider) {
    const key = this.getApiKey(provider);
    return !!(key && key.length > 0);
  }

  getCodexThreads() {
    return this.store.get('codexThreads', []);
  }

  setCodexThreads(threads) {
    this.store.set('codexThreads', threads || []);
  }

  addCodexThread(thread) {
    const threads = this.getCodexThreads();
    const updatedThreads = upsertItem(threads, thread, { limit: 100 });
    this.setCodexThreads(updatedThreads);
    return updatedThreads;
  }

  removeCodexThread(threadId) {
    const threads = this.getCodexThreads().filter(t => t.id !== threadId);
    this.setCodexThreads(threads);
    return threads;
  }

  getClaudeConversations() {
    return this.store.get('claudeConversations', []);
  }

  setClaudeConversations(conversations) {
    this.store.set('claudeConversations', conversations || []);
  }

  addClaudeConversation(conversation) {
    const conversations = this.getClaudeConversations();
    const updatedConversations = upsertItem(conversations, conversation, { limit: 100 });
    this.setClaudeConversations(updatedConversations);
    return updatedConversations;
  }

  removeClaudeConversation(conversationId) {
    const conversations = this.getClaudeConversations().filter(c => c.id !== conversationId);
    this.setClaudeConversations(conversations);
    return conversations;
  }

  getOpenCodeSessions() {
    return this.store.get('opencodeSessions', []);
  }

  setOpenCodeSessions(sessions) {
    this.store.set('opencodeSessions', sessions || []);
  }

  saveSessionOutput(sessionId, output) {
    const outputs = this.store.get('sessionOutputs', {});
    outputs[sessionId] = {
      output: output,
      savedAt: new Date().toISOString()
    };

    const entries = Object.entries(outputs);
    if (entries.length > 50) {
      entries.sort((a, b) => new Date(b[1].savedAt) - new Date(a[1].savedAt));
      const trimmed = Object.fromEntries(entries.slice(0, 50));
      this.store.set('sessionOutputs', trimmed);
    } else {
      this.store.set('sessionOutputs', outputs);
    }
  }

  getSessionOutput(sessionId) {
    const outputs = this.store.get('sessionOutputs', {});
    return outputs[sessionId]?.output || null;
  }

  removeSessionOutput(sessionId) {
    const outputs = this.store.get('sessionOutputs', {});
    delete outputs[sessionId];
    this.store.set('sessionOutputs', outputs);
  }

  clearOldSessionOutputs(maxAgeDays = 7) {
    const outputs = this.store.get('sessionOutputs', {});
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const filtered = {};
    for (const [id, data] of Object.entries(outputs)) {
      if (new Date(data.savedAt) > cutoff) {
        filtered[id] = data;
      }
    }

    this.store.set('sessionOutputs', filtered);
  }

  clear() {
    this.store.clear();
  }
}

module.exports = new ConfigStore();
