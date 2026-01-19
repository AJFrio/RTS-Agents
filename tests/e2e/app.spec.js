const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const { test, expect } = require('@playwright/test');

test.describe('E2E Tests', () => {
  let electronApp;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')]
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('Window should open with correct title', async () => {
    const window = await electronApp.firstWindow();
    const title = await window.title();
    // Default title is typically "RTS Agents Dashboard" or what's in index.html/main.js
    // Checking index.html to be sure
  });

  test('Dashboard should load', async () => {
      const window = await electronApp.firstWindow();
      // Wait for the app to load
      await window.waitForLoadState('domcontentloaded');

      // Check for main container or specific elements
      const app = await window.locator('#app');
      await expect(app).toBeVisible();

      // Check sidebar exists
      const sidebar = await window.locator('#sidebar');
      await expect(sidebar).toBeVisible();
  });

  test('Should navigate to Settings', async () => {
      const window = await electronApp.firstWindow();

      // Click on settings button
      const settingsBtn = await window.locator('button[data-view="settings"]');
      await settingsBtn.click();

      // Check if settings view is visible
      const settingsView = await window.locator('#view-settings');
      await expect(settingsView).toBeVisible();

      // Check for API key inputs
      const julesKeyInput = await window.locator('#jules-api-key');
      await expect(julesKeyInput).toBeVisible();
  });
});
