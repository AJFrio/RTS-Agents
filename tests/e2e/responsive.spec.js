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
        getRepositories: async (_provider) => ({
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
        createTask: async (_provider, _options) => ({ success: true }),
        onRefreshTick: (_cb) => {
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

  test('Mobile drawer is collapsed and the bottom bar is gone', async () => {
    await expect(page.locator('#bottom-nav')).toHaveCount(0);
    await expect(page.locator('#sidebar')).toHaveCount(0);

    const toggle = page.locator('#mobile-nav-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Mobile drawer exposes every sidebar destination', async () => {
    await page.locator('#mobile-nav-toggle').click();
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('#mobile-sidebar-drawer')).toBeVisible();

    for (const view of [
      'agent',
      'new-task',
      'plugins',
      'devices',
      'branches',
      'project-management',
      'settings',
    ]) {
      await expect(sidebar.locator(`button[data-view="${view}"]`)).toBeVisible();
    }
    await expect(sidebar.locator('button[data-view="dashboard"]')).toBeVisible();
  });

  test('Choosing a drawer destination navigates and collapses', async () => {
    await page.locator('#mobile-nav-toggle').click();
    await page.locator('#sidebar button[data-view="settings"]').click();
    await expect(page.locator('#view-title')).toHaveText('Settings');
    await expect(page.locator('#sidebar')).toHaveCount(0);

    await page.locator('#mobile-nav-toggle').click();
    await page.locator('#sidebar button[data-view="devices"]').click();
    await expect(page.locator('#view-title')).toHaveText('Devices');
    await expect(page.locator('#sidebar')).toHaveCount(0);
  });

  test('Drawer New Task button opens the new task page on mobile', async () => {
    await page.locator('#mobile-nav-toggle').click();
    const newTaskBtn = page.locator('#sidebar button[data-view="new-task"]');
    await expect(newTaskBtn).toBeVisible();
    await newTaskBtn.click();

    const view = page.locator('#new-task-modal');
    await expect(view).toBeVisible();
    await expect(page.locator('#sidebar')).toHaveCount(0);
  });

  test('Agent composer sits at the bottom of the mobile canvas', async () => {
    const composer = page.locator('#view-agent .composer-shell');
    await expect(composer).toBeVisible();
    await expect(page.locator('#bottom-nav')).toHaveCount(0);

    const composerBox = await composer.boundingBox();
    const viewport = page.viewportSize();
    expect(composerBox).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(composerBox.y + composerBox.height).toBeGreaterThan(viewport.height - 200);
  });
});
