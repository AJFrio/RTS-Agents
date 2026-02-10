import os
from playwright.sync_api import sync_playwright, expect

def verify_pull_requests(page):
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page Error: {err}"))
    # Mock electronAPI
    page.add_init_script("""
        window.electronAPI = {
            getSettings: () => Promise.resolve({
                settings: { theme: 'light' },
                apiKeys: { github: true },
                configuredServices: { github: true }
            }),
            getAgents: () => Promise.resolve({ agents: [], counts: {} }),
            getConnectionStatus: () => Promise.resolve({}),
            listComputers: () => Promise.resolve({ computers: [], configured: false }),
            github: {
                getRepos: () => Promise.resolve({ success: true, repos: [] }),
                getAllPrs: () => Promise.resolve({
                    success: true,
                    prs: [
                        {
                            id: 1,
                            number: 101,
                            title: "Fix login bug",
                            state: "open",
                            updated_at: new Date().toISOString(),
                            head: { ref: "feature/login-fix" },
                            base: { ref: "main", repo: { full_name: "jules/app", name: "app", owner: { login: "jules" } } },
                            user: { login: "jules-dev" }
                        },
                        {
                            id: 2,
                            number: 42,
                            title: "Add dark mode",
                            state: "open",
                            updated_at: new Date(Date.now() - 86400000).toISOString(),
                            head: { ref: "feature/dark-mode" },
                            base: { ref: "main", repo: { full_name: "jules/ui-kit", name: "ui-kit", owner: { login: "jules" } } },
                            user: { login: "designer-dave" }
                        }
                    ]
                })
            },
            onRefreshTick: (cb) => { return () => {} }
        };
    """)

    page.goto("http://localhost:5173")

    # Wait for app to load
    page.wait_for_selector("text=Dashboard", state="visible")

    # Click Pull Requests tab
    # The label is "Pull Requests" in the sidebar
    page.click("text=Pull Requests")

    # Verify header
    # Sidebar has an h1 "RTS Agents", so we need to be specific or wait for the new one
    expect(page.locator("#view-pull-requests h1")).to_have_text("Pull Requests")

    # Verify PRs are listed
    expect(page.locator("text=Fix login bug")).to_be_visible()
    expect(page.locator("text=Add dark mode")).to_be_visible()
    expect(page.locator("text=jules/app")).to_be_visible()
    expect(page.locator("text=feature/login-fix")).to_be_visible()

    # Take screenshot
    os.makedirs("/home/jules/verification", exist_ok=True)
    page.screenshot(path="/home/jules/verification/pull_requests.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_pull_requests(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
            raise
        finally:
            browser.close()
