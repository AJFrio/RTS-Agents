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

    // Verify the new connected services summary is visible
    const connectedServicesHeader = window.locator('h2:has-text("Connected Services")');
    await expect(connectedServicesHeader).toBeVisible();

    // Verify onboarding entry point exists
    const addServiceBtn = window.locator('button:has-text("ADD SERVICE")');
    await expect(addServiceBtn).toBeVisible();

    // Check for Theme options
    const themeSection = window.locator('h3:has-text("Display")');
    await expect(themeSection).toBeVisible();

    // Check for Theme buttons
    const lightThemeBtn = window.locator('#theme-light');
    await expect(lightThemeBtn).toBeVisible();
    const darkThemeBtn = window.locator('#theme-dark');
    await expect(darkThemeBtn).toBeVisible();
  });

  test('should open the onboarding modal from settings', async () => {
    const settingsBtn = window.locator('button[data-view="settings"]');
    await settingsBtn.click();

    const addServiceBtn = window.locator('button:has-text("ADD SERVICE")');
    await addServiceBtn.click();

    const onboardingTitle = window.locator('h2:has-text("Service Onboarding")');
    await expect(onboardingTitle).toBeVisible();

    const verifyButton = window.locator('button:has-text("VERIFY & CONNECT")');
    await expect(verifyButton).toBeVisible();
  });

  test('should switch back to Dashboard view', async () => {
    const closeModalBtn = window.locator('button:has-text("Cancel")');
    if (await closeModalBtn.isVisible().catch(() => false)) {
      await closeModalBtn.click();
    }

    const dashboardBtn = window.locator('button[data-view="dashboard"]');
    await dashboardBtn.click();

    const dashboardView = window.locator('#view-dashboard');
    await expect(dashboardView).toBeVisible();

    // Settings view should be hidden
    const settingsView = window.locator('#view-settings');
    await expect(settingsView).toBeHidden();
  });
});
