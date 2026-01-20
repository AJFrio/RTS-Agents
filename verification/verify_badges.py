from playwright.sync_api import sync_playwright

def verify_computer_badges():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the app
        page.goto("file:///app/index.html")

        # Mock electronAPI
        page.evaluate("""
            window.electronAPI = {
                onRefreshTick: () => {},
                getSettings: () => Promise.resolve({
                    settings: { theme: 'dark', displayMode: 'windowed' },
                    apiKeys: { cloudflare: true },
                    cloudflare: { configured: true, accountId: 'acc1', namespaceTitle: 'rtsa' }
                }),
                getAgents: () => Promise.resolve({ agents: [], counts: {}, errors: [] }),
                getConnectionStatus: () => Promise.resolve({}),
                listComputers: () => Promise.resolve({
                    success: true,
                    configured: true,
                    computers: [
                        {
                            id: 'device-1',
                            name: 'Dev Machine',
                            status: 'on',
                            lastHeartbeat: new Date().toISOString(),
                            tools: {
                                gemini: true,
                                'claude-cli': true,
                                codex: true,
                                cursor: true,
                                jules: true,
                                'claude-cloud': true
                            }
                        },
                        {
                            id: 'device-2',
                            name: 'Minimal Machine',
                            status: 'on',
                            lastHeartbeat: new Date().toISOString(),
                            tools: {}
                        }
                    ]
                })
            };
        """)

        # Wait for app to initialize
        page.wait_for_timeout(1000)

        # Navigate to Computers view
        # We can trigger it by calling showView('computers')
        page.evaluate("window.showView('computers')")

        # Wait for computers to render
        page.wait_for_selector(".agent-card")

        # Take screenshot
        page.screenshot(path="verification/computer_badges.png")

        browser.close()

if __name__ == "__main__":
    verify_computer_badges()
