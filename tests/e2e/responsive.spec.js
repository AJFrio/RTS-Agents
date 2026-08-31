const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Responsive Tests', () => {
  let electronApp;
  let page;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')],
    });
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test.beforeEach(async () => {
    page = await electronApp.firstWindow();

    // Emulate a mobile phone viewport (iPhone 14-ish)
    await page.setViewportSize({ width: 390, height: 844 });

    // Inject mock API before the page loads/reloads
    await page.addInitScript(() => {
      window.__electronAPI = {
        getAgents: async () => ({
          full: true,
          agents: [
            {
              provider: 'antigravity',
              rawId: 'task-123',
              name: 'Test Agent',
              status: 'running',
              prompt: 'Test prompt for agent',
              repository: 'https://github.com/user/test-repo',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          counts: { antigravity: 1, total: 1 },
          errors: [],
        }),
        getSettings: async () => ({
          settings: {
            pollingInterval: 30000,
            autoPolling: false,
            antigravityPaths: [],
            theme: 'dark',
          },
          githubPaths: [],
          apiKeys: { jules: true, cursor: true, codex: true, claude: true },
          antigravityInstalled: true,
          claudeCliInstalled: true,
        }),
        getConnectionStatus: async () => ({
          antigravity: { connected: true },
          jules: { connected: true },
          cursor: { connected: true },
          codex: { connected: true },
          'claude-cli': { connected: true },
          'claude-cloud': { connected: true },
        }),
        getAgentDetails: async (provider, rawId) => ({
          name: 'Test Agent Details',
          status: 'running',
          rawId: rawId,
          repository: 'https://github.com/user/test-repo',
          branch: 'main',
          prompt: 'Detailed prompt content',
          summary: 'Agent summary text',
          conversation: [
            { isUser: true, text: 'Hello agent' },
            { isUser: false, text: 'Hello user' },
          ],
          messages: [],
          activities: [{ title: 'Task started', timestamp: new Date().toISOString() }],
        }),
        getRepositories: async (provider) => ({
          success: true,
          repositories: [
            {
              id: 'repo-1',
              name: 'my-repo',
              url: 'https://github.com/user/my-repo',
              displayName: 'MY-REPO',
            },
            {
              id: 'repo-2',
              name: 'other-repo',
              url: 'https://github.com/user/other-repo',
              displayName: 'OTHER-REPO',
            },
          ],
        }),
        createTask: async (provider, options) => ({ success: true }),
        onRefreshTick: (cb) => {
          return () => {};
        },
        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async () => {},
      };
    });

    // Reload to ensure the init script runs and the app initializes with the mock
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  });

  test('BottomNav is visible and sidebar is hidden on mobile viewport', async () => {
    const bottomNav = page.locator('#bottom-nav');
    await expect(bottomNav).toBeVisible();

    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeHidden();

    await expect(bottomNav.locator('button[data-view="dashboard"]')).toBeVisible();
    await expect(bottomNav.locator('button[data-view="settings"]')).toBeVisible();
  });

  test('BottomNav click switches views', async () => {
    await page.locator('#bottom-nav button[data-view="settings"]').click();
    await expect(page.locator('#view-title')).toHaveText('Settings');

    await page.locator('#bottom-nav button[data-view="devices"]').click();
    await expect(page.locator('#view-title')).toHaveText('Devices');
  });

  test('BottomNav New Task button opens the new task page on mobile', async () => {
    const newTaskBtn = page.locator('#bottom-nav button[data-view="new-task"]');
    await expect(newTaskBtn).toBeVisible();
    await newTaskBtn.click();

    const view = page.locator('#new-task-modal');
    await expect(view).toBeVisible();
  });
});
