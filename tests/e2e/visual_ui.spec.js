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
});
