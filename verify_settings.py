from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_settings_page(page: Page):
    # Log console messages
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Browser Error: {err}"))

    # Mock electronAPI
    page.add_init_script("""
        window.electronAPI = {
            getSettings: () => Promise.resolve({
                settings: {
                    selectedModel: 'openrouter/openai/gpt-4o',
                    theme: 'dark',
                    autoPolling: false,
                    pollingInterval: 30000,
                    githubPaths: [],
                    cursorPaths: [],
                    geminiPaths: [],
                    claudePaths: [],
                    codexPaths: [],
                    filters: {},
                    jiraBaseUrl: ''
                },
                apiKeys: {},
                configuredServices: {},
                connectionStatus: {},
                computers: { configured: false }
            }),
            orchestratorGetModels: () => Promise.resolve({
                models: [
                    { id: 'openrouter/openai/gpt-4o', name: 'OpenAI GPT-4o', provider: 'openrouter' },
                    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' }
                ],
                errors: []
            }),
            setModel: (model) => {
                console.log('setModel called with', model);
                return Promise.resolve({ success: true });
            },
            onRefreshTick: (cb) => { return () => {} },
            getConnectionStatus: () => Promise.resolve({}),
            getAgents: () => Promise.resolve({ agents: [] }),
            listComputers: () => Promise.resolve({ success: true, computers: [] }),
            saveFilters: () => Promise.resolve({}),
            github: { getRepos: () => Promise.resolve({repos:[]}) },
            jira: { getBoards: () => Promise.resolve({boards:[]}) },
            projects: { getLocalRepos: () => Promise.resolve({repos:[]}) }
        };
    """)

    try:
        # Go to app
        page.goto("http://localhost:5173")

        # Click Settings in sidebar
        page.locator("button[data-view='settings']").click()

        # Wait for page load
        page.wait_for_timeout(2000)

        # Check for "Cloud Service Keys" section
        expect(page.get_by_role("heading", name="Cloud Service Keys")).to_be_visible()
        expect(page.get_by_text("Jules API Key")).to_be_visible()

        # Check for "Agent Model Keys" section
        expect(page.get_by_role("heading", name="Agent Model Keys")).to_be_visible()
        expect(page.get_by_text("Anthropic Claude API Key")).to_be_visible()

        # Check for "Agent Model" section (exact match)
        expect(page.get_by_role("heading", name="Agent Model", exact=True)).to_be_visible()
        expect(page.get_by_text("Orchestrator Model")).to_be_visible()

        # Wait for models to load and value to populate
        page.wait_for_timeout(1000)

        # Find input by value
        input_locator = page.locator("input[value='OpenAI GPT-4o']")
        expect(input_locator).to_be_visible()

        # Click to open dropdown
        input_locator.click()

        # Check for dropdown items
        expect(page.get_by_text("Claude 3.5 Sonnet")).to_be_visible()

        # Take screenshot
        page.screenshot(path="/home/jules/verification/settings_page_model.png")

    except Exception as e:
        print(f"Failed: {e}")
        page.screenshot(path="/home/jules/verification/error.png")
        raise e

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings_page(page)
        finally:
            browser.close()
