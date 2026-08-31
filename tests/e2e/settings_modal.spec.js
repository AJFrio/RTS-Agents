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

    // Check for Theme options
    const themeSection = window.locator('h3:has-text("Display")');
    await expect(themeSection).toBeVisible();

    // Check for Theme buttons
    const lightThemeBtn = window.locator('#theme-light');
    await expect(lightThemeBtn).toBeVisible();
    const darkThemeBtn = window.locator('#theme-dark');
    await expect(darkThemeBtn).toBeVisible();
  });

  test('should open the onboarding modal from a Plugins catalog card', async () => {
    const pluginsBtn = window.locator('button[data-view="plugins"]');
    await pluginsBtn.click();

    const addServiceBtn = window
      .locator('#view-plugins')
      .locator('section')
      .filter({ hasText: 'Available services' })
      .getByRole('button', { name: /add service/i })
      .first();
    await addServiceBtn.click();

    const onboardingTitle = window.locator('h2').filter({ hasText: /^Connect / });
    await expect(onboardingTitle).toBeVisible();
    await expect(window.locator('h2:has-text("Service Onboarding")')).toHaveCount(0);

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

  async function openCloudflareOnboarding() {
    const closeModalBtn = window.locator('button:has-text("Cancel")');
    if (await closeModalBtn.isVisible().catch(() => false)) {
      await closeModalBtn.click();
    }

    await window.locator('button[data-view="plugins"]').click();
    await expect(window.locator('#view-plugins')).toBeVisible();

    const cloudflareCard = window
      .locator('#view-plugins')
      .locator('div.rounded-lg')
      .filter({ has: window.locator('h3', { hasText: 'Cloudflare KV' }) })
      .first();
    await cloudflareCard.getByRole('button', { name: /^(Add service|Manage)$/ }).click();

    await expect(
      window.locator('h2').filter({ hasText: /^(Connect|Manage) Cloudflare KV$/ })
    ).toBeVisible();
    await expect(window.locator('h2:has-text("Service Onboarding")')).toHaveCount(0);
    // No catalog sidebar — "Sync integration" is not a nav control.
    await expect(window.locator('button:has-text("Sync integration")')).toHaveCount(0);
  }

  test('shows Cloudflare token-first setup with Detect & connect', async () => {
    await openCloudflareOnboarding();

    await expect(
      window.locator('h2').filter({ hasText: /^(Connect|Manage) Cloudflare KV$/ })
    ).toBeVisible();
    await expect(
      window.locator('button:has-text("Create token on Cloudflare")')
    ).toBeVisible();
    await expect(window.locator('button:has-text("Detect & connect")')).toBeVisible();
    await expect(window.locator('button:has-text("Detect Account ID")')).toHaveCount(0);

    await expect(window.locator('input[placeholder*="API token"]')).toBeVisible();
    await expect(window.locator('input[placeholder*="account ID"]')).toBeVisible();
  });

  test('hides Detect & connect when discoverCloudflareAccount is unavailable (web degradation)', async () => {
    // Simulates a bridge lacking discoverCloudflareAccount (web adapter /
    // older preload): ElectronAPI prefers window.__electronAPI over the real
    // preload bridge, so clone the bridge minus the method. The clone must be
    // a plain object — contextBridge properties are read-only and
    // non-configurable, so a Proxy get trap cannot mask them.
    await window.addInitScript(() => {
      const install = () => {
        if (window.__electronAPI) return true;
        if (!window.electronAPI) return false;
        window.__electronAPI = { ...window.electronAPI };
        delete window.__electronAPI.discoverCloudflareAccount;
        return true;
      };
      if (!install()) {
        const timer = setInterval(() => {
          if (install()) clearInterval(timer);
        }, 0);
        setTimeout(() => clearInterval(timer), 2000);
      }
    });

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    await openCloudflareOnboarding();

    await expect(
      window.locator('button:has-text("Create token on Cloudflare")')
    ).toBeVisible();
    await expect(window.locator('button:has-text("Detect & connect")')).toHaveCount(0);
    await expect(window.locator('button:has-text("Detect Account ID")')).toHaveCount(0);
  });
});
