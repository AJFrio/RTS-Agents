const Store = require('electron-store');

const schema = {
  apiKeys: {
    type: 'object',
    properties: {
      cursor: {
        type: 'string',
        default: ''
      },
      jules: {
        type: 'string',
        default: ''
      },
      codex: {
        type: 'string',
        default: ''
      },
      claude: {
        type: 'string',
        default: ''
      },
      github: {
        type: 'string',
        default: ''
      }
    },
    default: {}
  },
  codexThreads: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string' },
        prompt: { type: 'string' },
        repository: { type: 'string' },
        branch: { type: 'string' },
        title: { type: 'string' }
      }
    },
    default: []
  },
  claudeConversations: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
        prompt: { type: 'string' },
        repository: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' }
      }
    },
    default: []
  },
  settings: {
    type: 'object',
    properties: {
      pollingInterval: {
        type: 'number',
        default: 30000, // 30 seconds
        minimum: 5000,
        maximum: 300000
      },
      autoPolling: {
        type: 'boolean',
        default: true
      },
      geminiPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      githubPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      },
      theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        default: 'system'
      },
      displayMode: {
        type: 'string',
        enum: ['fullscreen', 'windowed'],
        default: 'fullscreen'
      },
      filters: {
        type: 'object',
        properties: {
          providers: {
            type: 'object',
            default: {}
          },
          statuses: {
            type: 'object',
            default: {}
          },
          search: {
            type: 'string',
            default: ''
          }
        },
        default: {}
      }
    },
    default: {}
  },
  sessionOutputs: {
    type: 'object',
    default: {}
  }
};

class ConfigStore {
  constructor() {
    this.store = new Store({
      name: 'rts-agents-config',
      schema,
      encryptionKey: 'rts-agents-v1-secure-key', // Basic encryption for API keys
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

  getDisplayMode() {
    return this.store.get('settings.displayMode', 'fullscreen');
  }

  setDisplayMode(mode) {
    this.store.set('settings.displayMode', mode);
  }

  // Gemini project paths
  getGeminiPaths() {
    return this.store.get('settings.geminiPaths', []);
  }

  addGeminiPath(path) {
    const paths = this.getGeminiPaths();
    if (!paths.includes(path)) {
      paths.push(path);
      this.store.set('settings.geminiPaths', paths);
    }
    return paths;
  }

  removeGeminiPath(path) {
    const paths = this.getGeminiPaths().filter(p => p !== path);
    this.store.set('settings.geminiPaths', paths);
    return paths;
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

  // Full config export/import
  getFullConfig() {
    return {
      apiKeys: this.getAllApiKeys(),
      settings: this.getAllSettings()
    };
  }

  // Check if API key is configured
  hasApiKey(provider) {
    const key = this.getApiKey(provider);
    return !!(key && key.length > 0);
  }

  // Codex thread tracking
  getCodexThreads() {
    return this.store.get('codexThreads', []);
  }

  setCodexThreads(threads) {
    this.store.set('codexThreads', threads || []);
  }

  addCodexThread(thread) {
    const threads = this.getCodexThreads();
    const existingIndex = threads.findIndex(t => t.id === thread.id);
    
    if (existingIndex >= 0) {
      threads[existingIndex] = { ...threads[existingIndex], ...thread };
    } else {
      threads.unshift(thread);
    }

    // Keep only last 100 threads
    const trimmedThreads = threads.slice(0, 100);
    this.setCodexThreads(trimmedThreads);
    return trimmedThreads;
  }

  removeCodexThread(threadId) {
    const threads = this.getCodexThreads().filter(t => t.id !== threadId);
    this.setCodexThreads(threads);
    return threads;
  }

  // Claude conversation tracking
  getClaudeConversations() {
    return this.store.get('claudeConversations', []);
  }

  setClaudeConversations(conversations) {
    this.store.set('claudeConversations', conversations || []);
  }

  addClaudeConversation(conversation) {
    const conversations = this.getClaudeConversations();
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);
    
    if (existingIndex >= 0) {
      conversations[existingIndex] = { ...conversations[existingIndex], ...conversation };
    } else {
      conversations.unshift(conversation);
    }

    // Keep only last 100 conversations
    const trimmedConversations = conversations.slice(0, 100);
    this.setClaudeConversations(trimmedConversations);
    return trimmedConversations;
  }

  removeClaudeConversation(conversationId) {
    const conversations = this.getClaudeConversations().filter(c => c.id !== conversationId);
    this.setClaudeConversations(conversations);
    return conversations;
  }

  // GitHub repository paths
  getGithubPaths() {
    return this.store.get('settings.githubPaths', []);
  }

  addGithubPath(path) {
    const paths = this.getGithubPaths();
    if (!paths.includes(path)) {
      paths.push(path);
      this.store.set('settings.githubPaths', paths);
    }
    return paths;
  }

  removeGithubPath(path) {
    const paths = this.getGithubPaths().filter(p => p !== path);
    this.store.set('settings.githubPaths', paths);
    return paths;
  }

  // Get all project paths (combines Gemini paths and GitHub paths)
  getAllProjectPaths() {
    const geminiPaths = this.getGeminiPaths();
    const githubPaths = this.getGithubPaths();
    // Combine and deduplicate
    return [...new Set([...geminiPaths, ...githubPaths])];
  }

  // Session output persistence (for terminated CLI sessions)
  saveSessionOutput(sessionId, output) {
    const outputs = this.store.get('sessionOutputs', {});
    outputs[sessionId] = {
      output: output,
      savedAt: new Date().toISOString()
    };
    
    // Clean up old outputs (keep only last 50)
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

  // Clear all data
  clear() {
    this.store.clear();
  }
}

// Export singleton instance
module.exports = new ConfigStore();
