const { _electron: electron } = require('playwright');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('Task Creation Shortcut', () => {
  let electronApp;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')],
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('Ctrl+Enter in prompt textarea should trigger submission', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Open New Task tab
    await window.click('#new-task-btn');
    const view = window.locator('#new-task-modal');
    await expect(view).toBeVisible();

    // Type in prompt
    const promptInput = window.locator('#task-prompt');
    await promptInput.fill('Test prompt for shortcut');

    // Press Ctrl+Enter
    await promptInput.press('Control+Enter');

    const toast = window.getByText('Choose an agent before creating the task.').last();
    await expect(toast).toBeVisible();
  });

  test('New Task page exposes branch/ref and disabled reason', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.click('#new-task-btn');
    const view = window.locator('#new-task-modal');
    await expect(view).toBeVisible();

    await expect(window.locator('#task-branch')).toBeVisible();
    await expect(view).toContainText('Choose an agent before creating the task.');
    await expect(window.locator('#create-task-btn')).toBeDisabled();
  });
});
