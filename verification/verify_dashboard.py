from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8080/benchmarks/dashboard/index.html")

        # Wait for chart canvas to be present
        page.wait_for_selector("#timeChart")
        page.wait_for_selector("#tokenChart")

        # Wait for table to be populated (wait for rows)
        page.wait_for_selector("#resultsTable tbody tr")

        # Take screenshot
        page.screenshot(path="verification/dashboard.png", full_page=True)
        browser.close()

if __name__ == "__main__":
    run()
