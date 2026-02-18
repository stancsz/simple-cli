import { test, expect } from '@playwright/test';

test('Github Pages Verification', async ({ page }) => {
    // 1. Visit the main GitHub Pages URL
    await page.goto('https://stancsz.github.io/simple-cli/');

    // 2. Check for the title
    // Based on fetch output: <h1 id="simple-cli-documentation">Simple CLI Documentation</h1>
    // There might be another H1 from the theme.
    // Let's check if "Simple CLI Documentation" is visible as a heading.
    await expect(page.getByRole('heading', { name: 'Simple CLI Documentation' })).toBeVisible();

    // 3. Verifying Advanced Demos exist
    await expect(page.getByText('Advanced Capabilities')).toBeVisible();

    const advOilGasLink = page.getByRole('link', { name: 'Oil & Gas: Predictive Maintenance AI' });
    await expect(advOilGasLink).toBeVisible();

    const advDevLink = page.getByRole('link', { name: 'Developer: Full-Stack Feature Implementation' });
    await expect(advDevLink).toBeVisible();

    // 4. Click the "Advanced Oil & Gas" link
    await advOilGasLink.click();
    // Expect URL to switch (likely ends with .html)
    await expect(page).toHaveURL(/.*oil_gas_advanced/);

    // Check content: "Advanced Oil & Gas Analyst Demo"
    await expect(page.getByRole('heading', { name: 'Advanced Oil & Gas Analyst Demo' })).toBeVisible();
    await expect(page.getByText('Isolation Forest')).toBeVisible();

    // 5. Navigate back and check Advanced Developer demo
    await page.goto('https://stancsz.github.io/simple-cli/');
    // Wait for main page load
    await expect(page.getByRole('heading', { name: 'Simple CLI Documentation' })).toBeVisible();

    await advDevLink.click();
    await expect(page).toHaveURL(/.*developer_advanced/);
    await expect(page.getByRole('heading', { name: 'Advanced Developer Demo' })).toBeVisible();
    await expect(page.getByText('FastAPI-Limiter')).toBeVisible();
});
