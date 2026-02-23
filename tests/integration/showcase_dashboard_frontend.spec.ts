import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

test.describe('Showcase Dashboard Frontend', () => {
  let serverProcess: ChildProcess;
  const PORT = 3003;
  const BASE_URL = `http://localhost:${PORT}`;

  test.beforeAll(async () => {
    // Start dashboard server on custom port
    const serverPath = join(process.cwd(), 'demos', 'showcase-dashboard', 'server.ts');

    // We use env var to set port
    serverProcess = spawn('bun', ['run', serverPath], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe'
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server timeout')), 10000);
        serverProcess.stdout?.on('data', (data) => {
            if (data.toString().includes(`running on http://localhost:${PORT}`)) {
                clearTimeout(timer);
                resolve();
            }
        });
        serverProcess.stderr?.on('data', (data) => {
             console.log(`Server stderr: ${data}`);
        });
        serverProcess.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
  });

  test.afterAll(async () => {
    if (serverProcess) serverProcess.kill();
  });

  test('should load dashboard and show Start button', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Showcase Dashboard/);
    await expect(page.getByRole('button', { name: 'Start Live Demo' })).toBeVisible();
  });

  test('should start simulation and show logs', async ({ page }) => {
    await page.goto(BASE_URL);

    // Click Start
    await page.getByRole('button', { name: 'Start Live Demo' }).click();

    // Check for running state
    await expect(page.getByRole('button')).toHaveText('Running Simulation...');

    // Check logs (wait for first log)
    // The demo script prints "System: Starting Showcase Demo..."
    const logViewer = page.locator('.log-viewer');
    await expect(logViewer).toContainText('System: Starting Showcase Demo...', { timeout: 15000 });
  });
});
