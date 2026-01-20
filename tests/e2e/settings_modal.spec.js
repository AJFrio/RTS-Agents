const { _electron: electron } = require('playwright');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('Settings View', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')]
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('should navigate to Settings view and verify elements', async () => {
    // Click Settings button in sidebar
    const settingsBtn = window.locator('button[data-view="settings"]');
    await settingsBtn.click();

    // Verify Settings View is visible
    const settingsView = window.locator('#view-settings');
    await expect(settingsView).toBeVisible();

    // Verify API Keys Section exists
    const apiKeysHeader = window.locator('h3:has-text("API Command Keys")');
    await expect(apiKeysHeader).toBeVisible();

    // Check for Jules API Key input
    const julesInput = window.locator('#jules-api-key');
    await expect(julesInput).toBeVisible();

    // Check for Theme options
    const themeSection = window.locator('h3:has-text("Display")');
    await expect(themeSection).toBeVisible();

    // Check for Theme buttons
    const lightThemeBtn = window.locator('#theme-light');
    await expect(lightThemeBtn).toBeVisible();
    const darkThemeBtn = window.locator('#theme-dark');
    await expect(darkThemeBtn).toBeVisible();
  });

  test('should be able to enter an API key', async () => {
    // Navigate to Settings if not already there (though previous test should have left it there)
    // But tests should be independent if possible. Since we reuse the app instance, state persists.
    const settingsBtn = window.locator('button[data-view="settings"]');
    await settingsBtn.click();

    const julesInput = window.locator('#jules-api-key');
    await julesInput.fill('test-api-key');

    // We won't click SAVE as that might trigger IPC calls that fail or persist data we don't want
    // But we can verify the value is there
    await expect(julesInput).toHaveValue('test-api-key');
  });

  test('should switch back to Dashboard view', async () => {
    const dashboardBtn = window.locator('button[data-view="dashboard"]');
    await dashboardBtn.click();

    const dashboardView = window.locator('#view-dashboard');
    await expect(dashboardView).toBeVisible();

    // Settings view should be hidden
    const settingsView = window.locator('#view-settings');
    await expect(settingsView).toBeHidden();
  });
});
