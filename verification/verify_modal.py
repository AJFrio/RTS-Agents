from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock electronAPI to prevent errors during init
        page.add_init_script("""
            window.__electronAPI = {
                getAgents: () => Promise.resolve({ agents: [], counts: {} }),
                getSettings: () => Promise.resolve({ settings: {}, apiKeys: {} }),
                getConnectionStatus: () => Promise.resolve({}),
                listComputers: () => Promise.resolve({ computers: [] }),
                onRefreshTick: () => {},
                getRepositories: () => Promise.resolve({ success: true, repositories: [] })
            };
        """)

        # Load index.html
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/index.html")

        # Wait for app to init (DOMContentLoaded)
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(500) # bit more time for async init

        # Open New Task Modal
        page.click("#new-task-btn")

        # Wait for modal to be visible
        modal = page.wait_for_selector("#new-task-modal")

        # Verify classes
        # Find the main element inside the modal
        # Structure: #new-task-modal > div > div > main
        main_el = page.locator("#new-task-modal main")
        class_attr = main_el.get_attribute("class")
        print(f"Main class: {class_attr}")

        if "bg-slate-50" in class_attr and "dark:bg-[#0d0e11]" in class_attr:
            print("VERIFICATION PASS: Main background class updated.")
        else:
            print("VERIFICATION FAIL: Main background class incorrect.")

        # Verify toggle absence
        toggle_write = page.locator("#task-prompt-tab-write")
        if toggle_write.count() == 0:
             print("VERIFICATION PASS: Toggle button removed.")
        else:
             print("VERIFICATION FAIL: Toggle button still present.")

        # Screenshot
        page.screenshot(path="verification/modal_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
