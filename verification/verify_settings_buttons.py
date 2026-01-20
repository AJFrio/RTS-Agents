from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Mock electronAPI
    page.add_init_script("""
        window.electronAPI = {
            getSettings: () => Promise.resolve({
                settings: { theme: 'dark', displayMode: 'windowed' },
                apiKeys: {},
                geminiPaths: [],
                githubPaths: []
            }),
            getAgents: () => Promise.resolve({ agents: [], counts: { total: 0 }, errors: [] }),
            getConnectionStatus: () => Promise.resolve({}),
            listComputers: () => Promise.resolve({ computers: [], configured: false }),
            onRefreshTick: () => {},
            saveFilters: () => Promise.resolve(),
            openDirectory: () => Promise.resolve('/mock/path/selected')
        };
    """)

    cwd = os.getcwd()
    page.goto(f"file://{cwd}/index.html")

    # Click Settings
    page.click("button[data-view='settings']")

    # Wait for view to be visible
    page.wait_for_selector("#view-settings:not(.hidden)")

    # Check for browse buttons
    page.wait_for_selector("#browse-gemini-path")
    page.wait_for_selector("#browse-github-path")

    # Take screenshot
    page.screenshot(path="verification/settings_buttons.png")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
