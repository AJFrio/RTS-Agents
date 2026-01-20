from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Load the index.html directly
    page.goto('file:///app/index.html')

    # Mock electronAPI for getSettings to return keys and cloudflare configured
    page.evaluate("""
        window.electronAPI = {
            getSettings: async () => ({
                settings: { theme: 'dark', displayMode: 'fullscreen', pollingInterval: 30000, autoPolling: true },
                apiKeys: { jules: true, cloudflare: true },
                cloudflare: { configured: true, accountId: 'acc1' },
                geminiInstalled: true
            }),
            getConnectionStatus: async () => ({
                gemini: { connected: true },
                jules: { connected: true },
                cursor: { connected: false },
                codex: { connected: false },
                'claude-cli': { connected: false },
                'claude-cloud': { connected: false },
                github: { connected: false }
            }),
            getAgents: async () => ({ agents: [], counts: { total: 0 } }),
            pushKeysToCloudflare: async () => ({ success: true }),
            pullKeysFromCloudflare: async () => ({ success: true })
        };
    """)

    # Wait for app initialization (polling etc)
    page.wait_for_timeout(1000)

    # Click settings button (using data-view="settings")
    page.click('button[data-view="settings"]')

    # Wait for view transition
    page.wait_for_timeout(500)

    # Scroll to Cloudflare section if needed, or just take screenshot of the settings view
    # The Push/Pull keys buttons should be visible under Cloudflare section

    # Take screenshot
    page.screenshot(path='verification/settings_view.png')

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
