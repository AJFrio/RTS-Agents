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
    // Wait for the initial loadFile navigation to settle before reading the
    // title; querying mid-navigation destroys the execution context.
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('#app')).toBeVisible({ timeout: 15000 });
    expect(await window.title()).toBeTruthy();
  });

  test('Dashboard should load', async () => {
      const window = await electronApp.firstWindow();
      // Wait for the app to load (React mounts into #root then renders #app)
      await window.waitForLoadState('domcontentloaded');
      await window.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      // Check for main container or specific elements
      const app = window.locator('#app');
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

      // Settings owns display/polling/system only; services live in Plugins.
      await expect(settingsView).toContainText('Display');
  });

  test('Should navigate to Plugins and offer service onboarding', async () => {
      const window = await electronApp.firstWindow();

      const pluginsBtn = await window.locator('button[data-view="plugins"]');
      await pluginsBtn.click();

      const pluginsView = await window.locator('#view-plugins');
      await expect(pluginsView).toBeVisible();
      await expect(pluginsView.getByRole('button', { name: /add service/i }).first()).toBeVisible();
  });

  test('Should navigate to Devices view', async () => {
      const window = await electronApp.firstWindow();

      const devicesBtn = await window.locator('button[data-view="devices"]');
      await devicesBtn.click();

      const devicesView = await window.locator('#view-devices');
      await expect(devicesView).toBeVisible();
  });
});
