const { test, expect } = require('@playwright/test');

test.describe('Modal Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock API before the page loads
    await page.addInitScript(() => {
      window.__electronAPI = {
        getAgents: async () => ({
          agents: [{
            provider: 'gemini',
            rawId: 'task-123',
            name: 'Test Agent',
            status: 'running',
            prompt: 'Test prompt for agent',
            repository: 'https://github.com/user/test-repo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }],
          counts: { gemini: 1, total: 1 },
          errors: []
        }),
        getSettings: async () => ({
          settings: {
            pollingInterval: 30000,
            autoPolling: false,
            geminiPaths: [],
            theme: 'dark'
          },
          githubPaths: [],
          apiKeys: { jules: true, cursor: true, codex: true, claude: true },
          geminiInstalled: true,
          claudeCliInstalled: true
        }),
        getConnectionStatus: async () => ({
          gemini: { connected: true },
          jules: { connected: true },
          cursor: { connected: true },
          codex: { connected: true },
          'claude-cli': { connected: true },
          'claude-cloud': { connected: true }
        }),
        getAgentDetails: async (provider, rawId) => ({
          name: 'Test Agent Details',
          status: 'running',
          rawId: rawId,
          repository: 'https://github.com/user/test-repo',
          branch: 'main',
          prompt: 'Detailed prompt content',
          summary: 'Agent summary text',
          conversation: [
            { isUser: true, text: 'Hello agent' },
            { isUser: false, text: 'Hello user' }
          ],
          messages: [],
          activities: [
            { title: 'Task started', timestamp: new Date().toISOString() }
          ]
        }),
        getRepositories: async (provider) => ({
          success: true,
          repositories: [
            { id: 'repo-1', name: 'my-repo', url: 'https://github.com/user/my-repo', displayName: 'MY-REPO' },
            { id: 'repo-2', name: 'other-repo', url: 'https://github.com/user/other-repo', displayName: 'OTHER-REPO' }
          ]
        }),
        createTask: async (provider, options) => ({ success: true }),
        onRefreshTick: (cb) => { return () => {} },
        setApiKey: async () => {},
        testApiKey: async () => ({ success: true }),
        setTheme: async () => {},
        openExternal: async () => {}
      };
    });

    await page.goto('http://localhost:3333');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Agent Details Modal should open and display correct info', async ({ page }) => {
    // Wait for agents to load (the mock returns one agent)
    const agentCard = page.locator('.agent-card').first();
    await expect(agentCard).toBeVisible();

    // Click the agent card
    await agentCard.click();

    // Check if modal opens
    const modal = page.locator('#agent-modal');
    await expect(modal).toBeVisible();
    await expect(modal).not.toHaveClass(/hidden/);

    // Verify modal content from mocked getAgentDetails
    await expect(page.locator('#modal-title')).toHaveText('Test Agent Details');
    await expect(page.locator('#modal-status-badge')).toHaveText('RUNNING');
    await expect(page.locator('#modal-content')).toContainText('Detailed prompt content');
    await expect(page.locator('#modal-content')).toContainText('Agent summary text');
    await expect(page.locator('#modal-content')).toContainText('Hello agent');

    // Close the modal
    const closeIcon = modal.locator('.material-symbols-outlined', { hasText: 'close' });
    await closeIcon.click();

    // Verify modal is closed/hidden
    await expect(modal).toHaveClass(/hidden/);
  });

  test('New Task Modal should work correctly', async ({ page }) => {
    // Open New Task Modal
    const newTaskBtn = page.locator('#new-task-btn');
    await newTaskBtn.click();

    const modal = page.locator('#new-task-modal');
    await expect(modal).toBeVisible();

    // Select a service (e.g., Gemini)
    const geminiBtn = page.locator('#service-gemini');
    await geminiBtn.click();
    await expect(geminiBtn).toHaveClass(/border-\[#C2B280\]/);

    // Repo search should become enabled and populated
    const repoSearch = page.locator('#task-repo-search');
    await expect(repoSearch).toBeEnabled();

    // Click repo search to see dropdown
    await repoSearch.click();
    const dropdown = page.locator('#repo-dropdown');
    await expect(dropdown).toBeVisible();

    // Select the first repo
    const firstRepo = dropdown.locator('.repo-option').first();
    await expect(firstRepo).toContainText('MY-REPO');
    await firstRepo.click();

    // Verify repo is selected
    await expect(repoSearch).toHaveValue('MY-REPO');

    // Enter prompt
    const promptInput = page.locator('#task-prompt');
    await promptInput.fill('Do something cool');

    // Create Task button should be enabled
    const createBtn = page.locator('#create-task-btn');
    await expect(createBtn).toBeEnabled();

    // Click Create
    await createBtn.click();

    // Verify success toast or modal close
    // Since mock createTask returns success, the modal should close
    await expect(modal).toHaveClass(/hidden/);

    // Verify toast appears (optional, might be hard to catch timing, but we can check existence)
    const toast = page.locator('text=Task created successfully');
    await expect(toast).toBeVisible();
  });
});
