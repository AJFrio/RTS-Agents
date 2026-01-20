const { _electron: electron } = require('playwright');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('Task Creation Shortcut', () => {
  let electronApp;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')]
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

    // Expect error toast because service is not selected
    // The toast is created in document.body
    // toast.textContent = message;
    // showToast('Please fill in all required fields', 'error');

    // We look for the toast with the specific text
    const toast = window.locator('text=Please fill in all required fields');
    await expect(toast).toBeVisible();
  });
});
