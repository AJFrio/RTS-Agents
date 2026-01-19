const configStore = require('../../src/main/services/config-store');

// The mock is automatically used because of jest.config.js moduleNameMapper
// but we might need to reset the singleton state or the mock store data
// Since configStore exports a singleton instance, we need to be careful.

describe('ConfigStore Unit Tests', () => {
  beforeEach(() => {
    configStore.clear();
  });

  describe('API Keys', () => {
    test('should set and get API keys', () => {
      configStore.setApiKey('gemini', 'test-key-123');
      expect(configStore.getApiKey('gemini')).toBe('test-key-123');
      expect(configStore.hasApiKey('gemini')).toBe(true);
    });

    test('should remove API keys', () => {
      configStore.setApiKey('gemini', 'test-key-123');
      configStore.removeApiKey('gemini');
      expect(configStore.getApiKey('gemini')).toBe('');
      expect(configStore.hasApiKey('gemini')).toBe(false);
    });

    test('should get all API keys', () => {
      configStore.setApiKey('gemini', 'key1');
      configStore.setApiKey('claude', 'key2');

      const keys = configStore.getAllApiKeys();
      expect(keys).toHaveProperty('gemini', 'key1');
      expect(keys).toHaveProperty('claude', 'key2');
    });
  });

  describe('Settings', () => {
    test('should set and get simple settings', () => {
      configStore.setSetting('theme', 'dark');
      expect(configStore.getSetting('theme')).toBe('dark');
    });

    test('should manage Gemini paths', () => {
      const path1 = '/path/to/project1';
      const path2 = '/path/to/project2';

      configStore.addGeminiPath(path1);
      configStore.addGeminiPath(path2);

      let paths = configStore.getGeminiPaths();
      expect(paths).toContain(path1);
      expect(paths).toContain(path2);
      expect(paths.length).toBe(2);

      // Add duplicate
      configStore.addGeminiPath(path1);
      paths = configStore.getGeminiPaths();
      expect(paths.length).toBe(2);

      // Remove path
      configStore.removeGeminiPath(path1);
      paths = configStore.getGeminiPaths();
      expect(paths).not.toContain(path1);
      expect(paths).toContain(path2);
    });

    test('should manage polling interval', () => {
      // Default
      expect(configStore.getPollingInterval()).toBe(30000);

      // Set valid
      configStore.setPollingInterval(10000);
      expect(configStore.getPollingInterval()).toBe(10000);

      // Min limit
      configStore.setPollingInterval(1000);
      expect(configStore.getPollingInterval()).toBe(5000);

      // Max limit
      configStore.setPollingInterval(1000000);
      expect(configStore.getPollingInterval()).toBe(300000);
    });
  });

  describe('Codex Threads', () => {
    test('should add and retrieve threads', () => {
      const thread = {
        id: 't1',
        title: 'Test Thread',
        createdAt: new Date().toISOString()
      };

      configStore.addCodexThread(thread);
      const threads = configStore.getCodexThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0]).toEqual(thread);
    });

    test('should update existing thread', () => {
      const thread = { id: 't1', title: 'Original' };
      configStore.addCodexThread(thread);

      const updated = { id: 't1', title: 'Updated' };
      configStore.addCodexThread(updated);

      const threads = configStore.getCodexThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('Updated');
    });

    test('should limit threads to 100', () => {
      for (let i = 0; i < 110; i++) {
        configStore.addCodexThread({ id: `t${i}`, title: `Thread ${i}` });
      }

      const threads = configStore.getCodexThreads();
      expect(threads).toHaveLength(100);
      // Should have the most recent ones (pushed last)
      expect(threads[0].id).toBe('t109');
    });
  });
});
