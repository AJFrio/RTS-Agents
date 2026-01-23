const { test, expect } = require('@playwright/test');

test.describe('E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock API before navigation
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

  test('Window should have correct title', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('RTS Agents');
  });

  test('Dashboard should load', async ({ page }) => {
    // Check for main container or specific elements
    const app = page.locator('#app');
    await expect(app).toBeVisible();

    // Check sidebar exists
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('Should navigate to Settings', async ({ page }) => {
    // Click on settings button
    const settingsBtn = page.locator('button[data-view="settings"]');
    await settingsBtn.click();

    // Check if settings view is visible
    const settingsView = page.locator('#view-settings');
    await expect(settingsView).toBeVisible();

    // Check for API key inputs
    const julesKeyInput = page.locator('#jules-api-key');
    await expect(julesKeyInput).toBeVisible();

    // Check for Cloudflare KV inputs
    const cloudflareAccountId = page.locator('#cloudflare-account-id');
    await expect(cloudflareAccountId).toBeVisible();
    const cloudflareApiToken = page.locator('#cloudflare-api-token');
    await expect(cloudflareApiToken).toBeVisible();
  });

  test('Should navigate to Computers view', async ({ page }) => {
    const computersBtn = page.locator('button[data-view="computers"]');
    await computersBtn.click();

    const computersView = page.locator('#view-computers');
    await expect(computersView).toBeVisible();
  });
});
