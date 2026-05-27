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

    // Open New Task Modal
    await window.click('#new-task-btn');
    const modal = window.locator('#new-task-modal');
    await expect(modal).toBeVisible();

    // Type in prompt
    const promptInput = window.locator('#task-prompt');
    await promptInput.fill('Test prompt for shortcut');

    // Press Ctrl+Enter
    await promptInput.press('Control+Enter');

    const toast = window.getByText('Choose an agent before creating the task.').last();
    await expect(toast).toBeVisible();
    await window.locator('[aria-label="Close modal"]').click({ position: { x: 5, y: 5 } });
  });

  test('New Task modal exposes branch/ref and disabled reason', async () => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.click('#new-task-btn');
    const modal = window.locator('#new-task-modal');
    await expect(modal).toBeVisible();

    await expect(window.locator('#task-branch')).toBeVisible();
    await expect(modal).toContainText('Choose an agent before creating the task.');
    await expect(window.locator('#create-task-btn')).toBeDisabled();
  });
});
