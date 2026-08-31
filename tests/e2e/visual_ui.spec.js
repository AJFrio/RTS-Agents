const { _electron: electron } = require('playwright');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('UI visual smoke coverage', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')],
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('captures primary desktop surfaces in light and dark mode', async () => {
    await window.locator('button[data-view="settings"]').click();
    await expect(window.locator('#view-settings')).toBeVisible();
    await window.locator('#theme-light').click();

    for (const view of [
      'dashboard',
      'agent',
      'branches',
      'pull-requests',
      'computers',
      'settings',
    ]) {
      await window.locator(`button[data-view="${view}"]`).click();
      await expect(window.locator(`#view-${view}`)).toBeVisible();
      await window.screenshot({ path: `test-results/visual-${view}-light.png`, fullPage: false });
    }

    await window.locator('#new-task-btn').click();
    await expect(window.locator('#new-task-modal')).toBeVisible();
    await window.screenshot({ path: 'test-results/visual-new-task-light.png', fullPage: false });
    await window.locator('[aria-label="Close modal"]').click({ position: { x: 5, y: 5 } });

    await window.locator('button[data-view="settings"]').click();
    await window.locator('#theme-dark').click();
    for (const view of ['dashboard', 'agent', 'settings']) {
      await window.locator(`button[data-view="${view}"]`).click();
      await expect(window.locator(`#view-${view}`)).toBeVisible();
      await window.screenshot({ path: `test-results/visual-${view}-dark.png`, fullPage: false });
    }
  });

  test('toast notifications anchor bottom-right', async () => {
    // Sonner only mounts its toaster element once a toast is active, so fire a
    // real one through the New Task flow with a mocked, side-effect-free API.
    await window.addInitScript(() => {
      window.__electronAPI = {
        getAgents: async () => ({ full: true, agents: [], counts: {}, errors: [] }),
        getSettings: async () => ({
          settings: { pollingInterval: 30000, autoPolling: false, theme: 'dark' },
          githubPaths: [],
          apiKeys: { antigravity: false },
          antigravityInstalled: true,
        }),
        getConnectionStatus: async () => ({ antigravity: { connected: true } }),
        getRepositories: async () => ({
          success: true,
          repositories: [
            { id: 'repo-1', name: 'my-repo', url: 'https://github.com/user/my-repo', displayName: 'MY-REPO' },
          ],
        }),
        createTask: async () => ({ success: true }),
        onRefreshTick: () => () => {},
        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async () => {},
      };
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('#new-task-btn').click();
    await expect(window.locator('#new-task-modal')).toBeVisible();
    await window.locator('#service-antigravity').click();
    const repoSearch = window.locator('#task-repo-search');
    await repoSearch.click();
    await window.locator('#repo-dropdown .repo-option').first().click();
    await window.locator('#task-prompt').fill('Toast position smoke task');
    await window.locator('#create-task-btn').click();

    const toaster = window.locator('[data-sonner-toaster]');
    await expect(window.locator('[data-sonner-toast]').first()).toBeVisible();
    await expect(toaster).toHaveAttribute('data-x-position', 'right');
    await expect(toaster).toHaveAttribute('data-y-position', 'bottom');
  });
});
