const { test, expect } = require('@playwright/test');

test.describe('Settings View', () => {
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
          jules: { connected: true },
          codex: { connected: true },
          'claude-cli': { connected: true },
          'claude-cloud': { connected: true }
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

  test('should navigate to Settings view and verify elements', async ({ page }) => {
    // Click Settings button in sidebar
    const settingsBtn = page.locator('button[data-view="settings"]');
    await settingsBtn.click();

    // Verify Settings View is visible
    const settingsView = page.locator('#view-settings');
    await expect(settingsView).toBeVisible();

    // Verify API Keys Section exists
    const apiKeysHeader = page.locator('h3:has-text("API Command Keys")');
    await expect(apiKeysHeader).toBeVisible();

    // Check for Jules API Key input
    const julesInput = page.locator('#jules-api-key');
    await expect(julesInput).toBeVisible();

    // Check for Theme options
    const themeSection = page.locator('h3:has-text("Display")');
    await expect(themeSection).toBeVisible();

    // Check for Theme buttons
    const lightThemeBtn = page.locator('#theme-light');
    await expect(lightThemeBtn).toBeVisible();
    const darkThemeBtn = page.locator('#theme-dark');
    await expect(darkThemeBtn).toBeVisible();
  });

  test('should be able to enter an API key', async ({ page }) => {
    const settingsBtn = page.locator('button[data-view="settings"]');
    await settingsBtn.click();

    const julesInput = page.locator('#jules-api-key');
    await julesInput.fill('test-api-key');

    // Verify the value is there
    await expect(julesInput).toHaveValue('test-api-key');
  });

  test('should switch back to Dashboard view', async ({ page }) => {
    // First go to settings
    const settingsBtn = page.locator('button[data-view="settings"]');
    await settingsBtn.click();
    await expect(page.locator('#view-settings')).toBeVisible();

    // Then switch to dashboard
    const dashboardBtn = page.locator('button[data-view="dashboard"]');
    await dashboardBtn.click();

    const dashboardView = page.locator('#view-dashboard');
    await expect(dashboardView).toBeVisible();

    // Settings view should be hidden
    const settingsView = page.locator('#view-settings');
    await expect(settingsView).toBeHidden();
  });
});
