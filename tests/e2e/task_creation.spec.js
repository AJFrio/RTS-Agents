const { test, expect } = require('@playwright/test');

test.describe('Task Creation Shortcut', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__electronAPI = {
        getAgents: async () => ({ agents: [], counts: { total: 0 }, errors: [] }),
        getSettings: async () => ({
          settings: { theme: 'dark', pollingInterval: 30000, autoPolling: false },
          githubPaths: [],
          apiKeys: { github: true, jules: true, cursor: true, codex: true, claude: true },
          geminiInstalled: true,
          claudeCliInstalled: true
        }),
        getConnectionStatus: async () => ({
          github: { connected: true },
          cursor: { connected: true },
          jules: { connected: true }
        }),
        onRefreshTick: () => {},
        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async () => {}
      };
    });

    await page.goto('http://localhost:3333');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Ctrl+Enter in prompt textarea should trigger submission', async ({ page }) => {
    // Open New Task Modal
    await page.click('#new-task-btn');
    const modal = page.locator('#new-task-modal');
    await expect(modal).toBeVisible();

    // Type in prompt
    const promptInput = page.locator('#task-prompt');
    await promptInput.fill('Test prompt for shortcut');

    // Press Ctrl+Enter
    await promptInput.press('Control+Enter');

    // Expect error toast because service is not selected
    const toast = page.locator('text=Please fill in all required fields');
    await expect(toast).toBeVisible();
  });
});
