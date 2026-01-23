const { test, expect } = require('@playwright/test');

test.describe('Merge workflow should not break inputs/dropdowns', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Minimal mocks to drive branches + merge workflow.
      window.__electronAPI = {
        getAgents: async () => ({ agents: [], counts: { total: 0 }, errors: [] }),
        getSettings: async () => ({
          settings: { theme: 'dark', pollingInterval: 30000, autoPolling: false },
          githubPaths: [],
          apiKeys: { github: true, jules: true, cursor: true, codex: true, claude: true },
          geminiInstalled: true,
          claudeCliInstalled: true
        }),
        getConnectionStatus: async () => ({
          github: { connected: true }
        }),
        onRefreshTick: () => {},

        getRepositories: async () => ({
          success: true,
          repositories: [
            { id: 'repo-1', name: 'my-repo', url: 'https://github.com/user/my-repo', displayName: 'MY-REPO' }
          ]
        }),
        createTask: async () => ({ success: true }),

        github: {
          getRepos: async () => ({
            success: true,
            repos: [
              {
                id: 101,
                name: 'demo-repo',
                html_url: 'https://github.com/acme/demo-repo',
                description: 'Demo repo',
                owner: { login: 'acme' },
                updated_at: new Date().toISOString(),
                private: false,
                open_issues_count: 0,
                stargazers_count: 0
              }
            ]
          }),
          getPrs: async () => ({
            success: true,
            prs: [
              {
                number: 7,
                title: 'Test PR',
                html_url: 'https://github.com/acme/demo-repo/pull/7',
                user: { login: 'octocat' },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                head: { ref: 'feature-1', repo: { name: 'demo-repo', owner: { login: 'acme' } } },
                base: { ref: 'main', repo: { name: 'demo-repo', owner: { login: 'acme' } } }
              }
            ]
          }),
          getPrDetails: async () => ({
            success: true,
            pr: {
              number: 7,
              title: 'Test PR',
              html_url: 'https://github.com/acme/demo-repo/pull/7',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              body: 'PR body',
              draft: false,
              mergeable: true,
              head: { ref: 'feature-1', repo: { name: 'demo-repo', owner: { login: 'acme' } } },
              base: { ref: 'main', repo: { name: 'demo-repo', owner: { login: 'acme' } } }
            }
          }),
          mergePr: async () => ({ success: true })
        },

        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async () => {}
      };
    });

    await page.goto('http://localhost:3333');
    await page.waitForLoadState('domcontentloaded');
  });

  test('After merging a PR, branches filter and new-task repo dropdown still work', async ({ page }) => {
    // Go to branches view
    await page.click('button[data-view="branches"]');
    await expect(page.locator('#view-branches')).toBeVisible();

    // Select repo (triggers PR load)
    const repoItem = page.locator('.repo-item').first();
    await expect(repoItem).toBeVisible();
    await repoItem.click();

    // Open PR details modal
    const prCard = page.locator('.pr-card').first();
    await expect(prCard).toBeVisible();
    await prCard.click();
    await expect(page.locator('#pr-modal')).toBeVisible();

    // Merge PR (confirm modal appears)
    await page.click('#merge-btn');
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.click('#confirm-ok-btn');

    // PR modal should close
    await expect(page.locator('#pr-modal')).toHaveClass(/hidden/);

    // Branches repo filter should still be focusable/editable
    const repoFilter = page.locator('#repo-filter');
    await repoFilter.click();
    await repoFilter.fill('demo');
    await expect(repoFilter).toHaveValue('demo');

    // New Task repo dropdown should still open + select
    await page.click('#new-task-btn');
    await expect(page.locator('#new-task-modal')).toBeVisible();
    await page.click('#service-jules');

    const repoSearch = page.locator('#task-repo-search');
    await expect(repoSearch).toBeEnabled();
    await repoSearch.click();
    await expect(page.locator('#repo-dropdown')).toBeVisible();

    await page.locator('#repo-dropdown .repo-option').first().click();
    await expect(repoSearch).toHaveValue(/.+/);
  });
});
