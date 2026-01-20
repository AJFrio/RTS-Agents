from playwright.sync_api import sync_playwright
import os

def test_settings_paths():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the index.html file
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # Mock window.electronAPI
        page.evaluate("""
            window.__electronAPI = {
                getSettings: async () => ({
                    settings: {
                        geminiPaths: [],
                        claudePaths: [],
                        cursorPaths: [],
                        codexPaths: [],
                        githubPaths: [],
                        theme: 'dark'
                    },
                    geminiDefaultPath: '/mock/default/path'
                }),
                onRefreshTick: () => {},
                getConnectionStatus: async () => ({
                    gemini: { connected: false },
                    jules: { connected: false },
                    cursor: { connected: false },
                    codex: { connected: false },
                    'claude-cli': { connected: false },
                    'claude-cloud': { connected: false },
                    github: { connected: false }
                }),
                getAgents: async () => ({ agents: [], counts: {} }),
                listComputers: async () => ({ success: true, computers: [] })
            };
        """)

        # Wait for app to initialize
        page.wait_for_timeout(1000)

        # Navigate to Settings
        page.click("button[data-view='settings']")

        # Take a screenshot of the settings page with new paths section
        page.screenshot(path="verification/settings_paths_final.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_settings_paths()
