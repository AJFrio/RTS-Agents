const { test, expect } = require('@playwright/test');

test.describe('Merge conflict actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__openedExternal = [];

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
          github: { connected: true },
          cursor: { connected: true },
          jules: { connected: true }
        }),
        onRefreshTick: () => {},

        getRepositories: async () => ({
          success: true,
          repositories: [
            { id: 'repo-101', name: 'demo-repo', url: 'https://github.com/acme/demo-repo', displayName: 'DEMO-REPO' }
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
                title: 'Conflicted PR',
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
              title: 'Conflicted PR',
              html_url: 'https://github.com/acme/demo-repo/pull/7',
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              body: 'PR body',
              draft: false,
              mergeable: false,
              head: { ref: 'feature-1', repo: { name: 'demo-repo', owner: { login: 'acme' } } },
              base: { ref: 'main', repo: { name: 'demo-repo', owner: { login: 'acme' } } }
            }
          }),
          getBranches: async () => ({
            success: true,
            branches: [{ name: 'main' }, { name: 'feature-1' }]
          }),
          mergePr: async () => ({ success: false, error: 'should not be called in this test' })
        },

        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async (url) => {
          window.__openedExternal.push(url);
          return { success: true };
        }
      };
    });

    await page.goto('http://localhost:3333');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Shows GitHub + Fix buttons and Fix pre-fills a task', async ({ page }) => {
    // Go to branches view
    await page.click('button[data-view="branches"]');
    await expect(page.locator('#view-branches')).toBeVisible();

    // Select repo (triggers PR load)
    await expect(page.locator('.repo-item').first()).toBeVisible();
    await page.locator('.repo-item').first().click();

    // Open PR details modal
    await expect(page.locator('.pr-card').first()).toBeVisible();
    await page.locator('.pr-card').first().click();
    await expect(page.locator('#pr-modal')).toBeVisible();

    // Conflict state shows action buttons
    await expect(page.locator('#merge-btn')).toBeDisabled();
    await expect(page.locator('#merge-github-btn')).toBeVisible();
    await expect(page.locator('#merge-fix-btn')).toBeVisible();

    // GitHub button opens PR url
    await page.click('#merge-github-btn');
    await expect.poll(async () => {
      return page.evaluate(() => window.__openedExternal.slice());
    }).toContain('https://github.com/acme/demo-repo/pull/7');

    // Fix button opens New Task modal, prefilled repo/branch/prompt
    await page.click('#merge-fix-btn');
    await expect(page.locator('#new-task-modal')).toBeVisible();

    await expect(page.locator('#task-repo-search')).toHaveValue('DEMO-REPO');
    await expect(page.locator('#task-branch')).toHaveValue('feature-1');
    await expect(page.locator('#task-prompt')).toHaveValue(/merge conflicts/i);
    await expect(page.locator('#task-prompt')).toHaveValue(/https:\/\/github\.com\/acme\/demo-repo\/pull\/7/);
    await expect(page.locator('#create-task-btn')).toBeEnabled();
  });
});
