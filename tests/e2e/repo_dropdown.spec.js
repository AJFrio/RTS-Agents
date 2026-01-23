const { test, expect } = require('@playwright/test');

test.describe('Repository Dropdown Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API
    await page.addInitScript(() => {
      window.__electronAPI = {
        getAgents: async () => ({ agents: [], counts: {} }),
        getSettings: async () => ({
          settings: { theme: 'system' },
          apiKeys: { jules: true }
        }),
        getConnectionStatus: async () => ({}),
        getRepositories: async (service) => {
          return {
            success: true,
            repositories: [
              { id: 1, name: 'repo-one', url: 'github.com/user/repo-one' },
              { id: 2, name: 'repo-two', url: 'github.com/user/repo-two' },
              { id: 3, name: 'repo-three', url: 'github.com/user/repo-three' }
            ]
          };
        },
        onRefreshTick: () => {}
      };
    });

    await page.goto('http://localhost:3333');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Keyboard navigation works in repository dropdown', async ({ page }) => {
    // Open New Task Modal
    await page.click('#new-task-btn');
    const modal = page.locator('#new-task-modal');
    await expect(modal).toBeVisible();

    // Select a service (e.g., Jules)
    await page.click('#service-jules');

    // Wait for repos to load (mock is instant, but good to wait for UI update)
    const repoSearch = page.locator('#task-repo-search');
    await expect(repoSearch).toBeEnabled();

    // Type to search (optional, but good to test filtering/dropdown trigger)
    await repoSearch.click();
    await repoSearch.fill('repo');

    // Dropdown should be visible
    const dropdown = page.locator('#repo-dropdown');
    await expect(dropdown).toBeVisible();

    // Verify items are present
    const options = dropdown.locator('.repo-option');
    await expect(options).toHaveCount(3);

    // Let's press ArrowDown
    await repoSearch.press('ArrowDown');

    // First item should be active
    await expect(options.nth(0)).toHaveClass(/active-repo-option/);
    await expect(options.nth(0)).toHaveClass(/bg-\[\#C2B280\]\/20/);

    // Press ArrowDown again
    await repoSearch.press('ArrowDown');

    // Second item should be active
    await expect(options.nth(1)).toHaveClass(/active-repo-option/);
    await expect(options.nth(0)).not.toHaveClass(/active-repo-option/);

    // Press ArrowUp
    await repoSearch.press('ArrowUp');

    // First item should be active again
    await expect(options.nth(0)).toHaveClass(/active-repo-option/);

    // Press Enter to select
    await repoSearch.press('Enter');

    // Dropdown should hide
    await expect(dropdown).toBeHidden();

    // Input should have the value of the selected repo
    await expect(repoSearch).toHaveValue('REPO-ONE');
  });

  test('Task Description font is readable', async ({ page }) => {
    await page.click('#new-task-btn');

    const textarea = page.locator('#task-prompt');

    // Check for font-sans class and text-sm
    await expect(textarea).toHaveClass(/font-sans/);
    await expect(textarea).toHaveClass(/text-sm/);
    await expect(textarea).not.toHaveClass(/technical-font/);
    await expect(textarea).not.toHaveClass(/text-xs/);
  });
});
