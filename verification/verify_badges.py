
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock the window.electronAPI
        page.add_init_script("""
        window.electronAPI = {
            onRefreshTick: () => {},
            getSettings: async () => ({
                settings: { theme: 'dark', displayMode: 'windowed' },
                apiKeys: {},
                geminiInstalled: true,
                claudeCliInstalled: true
            }),
            getAgents: async () => ({ agents: [], counts: { total: 0 }, errors: [] }),
            getConnectionStatus: async () => ({
                gemini: { connected: true },
                jules: { connected: false },
                cursor: { connected: false },
                codex: { connected: false },
                'claude-cli': { connected: true },
                'claude-cloud': { connected: false },
                github: { connected: false }
            }),
            listComputers: async () => ({
                success: true,
                configured: true,
                computers: [
                    {
                        id: 'local-device',
                        name: 'Local Device',
                        status: 'on',
                        lastHeartbeat: new Date().toISOString(),
                        tools: [{ 'CLI tools': ['Gemini CLI', 'claude CLI'] }]
                    },
                    {
                        id: 'remote-device',
                        name: 'Remote Device',
                        status: 'on',
                        lastHeartbeat: new Date().toISOString(),
                        tools: [{ 'CLI tools': ['Codex CLI', 'cursor CLI'] }]
                    },
                     {
                        id: 'legacy-device',
                        name: 'Legacy Device',
                        status: 'on',
                        lastHeartbeat: new Date().toISOString(),
                        tools: { gemini: true, 'claude-cli': true }
                    }
                ]
            })
        };
        """)

        # Load the local index.html
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # Wait for the computers view to be ready (simulating a click if needed, or just calling loadComputers)
        # We can trigger the view change by clicking the nav button
        page.click("button[data-view='computers']")

        # Wait for the grid to populate
        page.wait_for_selector("#computers-grid .agent-card")

        # Take a screenshot
        page.screenshot(path="verification/computer_badges.png")

        browser.close()

if __name__ == "__main__":
    run()
