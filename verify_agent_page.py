import sys
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser error: {err}"))

    # Mock electronAPI
    # It seems the app uses invoke/on via contextBridge, but we are mocking the exposed `electronAPI` object directly.
    # We must ensure the object structure matches exactly what preload.js exposes.
    page.add_init_script("""
    window.electronAPI = {
        platform: 'linux',
        versions: { node: 'mock', chrome: 'mock', electron: 'mock' },
        getAgents: () => Promise.resolve({ agents: [], counts: {}, errors: [] }),
        getAgentDetails: () => Promise.resolve({}),
        getSettings: () => Promise.resolve({
            settings: {
                pollingInterval: 30000, autoPolling: false,
                geminiPaths: [], claudePaths: [], cursorPaths: [], codexPaths: [], githubPaths: [],
                theme: 'light', displayMode: 'fullscreen', jiraBaseUrl: ''
            },
            apiKeys: {},
            filters: { providers: {}, statuses: {}, search: '' },
            geminiInstalled: false, claudeCliInstalled: false, claudeCloudConfigured: false,
            geminiDefaultPath: '', claudeDefaultPath: '',
            claudePaths: [], cursorPaths: [], codexPaths: [], githubPaths: [],
            localDeviceId: 'mock-device'
        }),
        setApiKey: () => Promise.resolve(),
        setJiraBaseUrl: () => Promise.resolve(),
        testApiKey: () => Promise.resolve(),
        removeApiKey: () => Promise.resolve(),
        setCloudflareConfig: () => Promise.resolve(),
        clearCloudflareConfig: () => Promise.resolve(),
        testCloudflare: () => Promise.resolve(),
        listComputers: () => Promise.resolve({ success: true, computers: [], configured: false }),
        pushKeysToCloudflare: () => Promise.resolve(),
        pullKeysFromCloudflare: () => Promise.resolve(),
        setPolling: () => Promise.resolve(),
        setTheme: () => Promise.resolve(),
        setDisplayMode: () => Promise.resolve(),
        saveFilters: () => Promise.resolve(),
        addGeminiPath: () => Promise.resolve(),
        removeGeminiPath: () => Promise.resolve(),
        getGeminiPaths: () => Promise.resolve(),
        addClaudePath: () => Promise.resolve(),
        removeClaudePath: () => Promise.resolve(),
        getClaudePaths: () => Promise.resolve(),
        addCursorPath: () => Promise.resolve(),
        removeCursorPath: () => Promise.resolve(),
        getCursorPaths: () => Promise.resolve(),
        addCodexPath: () => Promise.resolve(),
        removeCodexPath: () => Promise.resolve(),
        getCodexPaths: () => Promise.resolve(),
        addGithubPath: () => Promise.resolve(),
        removeGithubPath: () => Promise.resolve(),
        getGithubPaths: () => Promise.resolve(),
        getAllProjectPaths: () => Promise.resolve(),
        updateApp: () => Promise.resolve(),
        openExternal: () => Promise.resolve(),
        openDirectory: () => Promise.resolve(),
        getConnectionStatus: () => Promise.resolve({}),
        getRepositories: () => Promise.resolve(),
        getAllRepositories: () => Promise.resolve(),
        createTask: () => Promise.resolve(),
        sendMessage: () => Promise.resolve(),
        onRefreshTick: (cb) => { return () => {}; },
        github: {
            getRepos: () => Promise.resolve({ repos: [] }),
            getAllPrs: () => Promise.resolve({ prs: [] }),
            getPrs: () => Promise.resolve({ prs: [] }),
            getBranches: () => Promise.resolve({ branches: [] }),
            getOwners: () => Promise.resolve(),
            getPrDetails: () => Promise.resolve(),
            getRepoFile: () => Promise.resolve(),
            mergePr: () => Promise.resolve(),
            closePr: () => Promise.resolve(),
            markPrReadyForReview: () => Promise.resolve(),
            createRepo: () => Promise.resolve()
        },
        jira: {
            getBoards: () => Promise.resolve({ boards: [] }),
            getSprints: () => Promise.resolve({ sprints: [] }),
            getBacklogIssues: () => Promise.resolve({ issues: [] }),
            getSprintIssues: () => Promise.resolve({ issues: [] }),
            getIssue: () => Promise.resolve(),
            getIssueComments: () => Promise.resolve()
        },
        projects: {
            createLocalRepo: () => Promise.resolve(),
            enqueueCreateRepo: () => Promise.resolve(),
            getLocalRepos: () => Promise.resolve({ success: true, repos: [] }),
            getRepoFile: () => Promise.resolve(),
            pullRepo: () => Promise.resolve()
        }
    };
    """)

    try:
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")

        # Wait for any potential loading state to clear
        page.wait_for_timeout(2000)

        # Click on "Agent" tab in sidebar
        print("Clicking Agent tab...")
        # Check if the button exists first
        if page.locator("button[data-view='agent']").count() == 0:
            print("Agent button not found!")
            page.screenshot(path="verification_not_found.png")
            sys.exit(1)

        page.click("button[data-view='agent']")

        # Wait for the agent page to load
        print("Waiting for Agent page...")
        page.wait_for_selector("#view-agent")

        # Allow some time for rendering
        page.wait_for_timeout(1000)

        # Check for messages
        content = page.content()
        if "Hello! How can I assist you today?" in content:
            print("FAILURE: Mock message found!")
            sys.exit(1)
        else:
            print("SUCCESS: Mock message not found.")

        page.screenshot(path="verification_agent_page.png")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification_error.png")
        sys.exit(1)
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
