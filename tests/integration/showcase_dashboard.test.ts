import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';
import { join } from 'path';

describe('Showcase Dashboard API', () => {
  let serverProcess: ChildProcess;
  const PORT = 3002;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Start the dashboard server
    const serverPath = join(process.cwd(), 'demos', 'showcase-dashboard', 'server.ts');
    serverProcess = spawn('bun', ['run', serverPath], {
      stdio: 'pipe',
      env: { ...process.env, PORT: String(PORT) } // Ensure port matches
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      serverProcess.stdout?.on('data', (data) => {
        if (data.toString().includes(`running on http://localhost:${PORT}`)) {
          resolve();
        }
      });
      serverProcess.stderr?.on('data', (data) => {
        console.error(`Server Error: ${data}`);
      });
      serverProcess.on('error', reject);
      setTimeout(() => reject(new Error('Server timeout')), 15000);
    });
  }, 20000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should serve the frontend', async () => {
    const res = await fetch(BASE_URL);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Showcase Dashboard'); // Title in index.html
  });

  it('should return metrics (proxied or error)', async () => {
    // Health monitor might not be running, so 503 is expected, or 200 if mocked
    const res = await fetch(`${BASE_URL}/api/metrics`);
    expect([200, 503]).toContain(res.status);
  });

  it('should trigger demo and stream logs', async () => {
    // Trigger demo
    const triggerRes = await fetch(`${BASE_URL}/api/trigger-demo`);
    expect(triggerRes.status).toBe(200);
    const json = await triggerRes.json();
    expect(json).toEqual({ message: "Demo started" });

    // Connect to SSE
    // node-fetch doesn't support SSE well, simple check
    // We can't easily test SSE stream with fetch but we can verify endpoint exists
    // and returns correct headers.
    const logsRes = await fetch(`${BASE_URL}/api/logs`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.headers.get('content-type')).toBe('text/event-stream');

    // We could read the stream but keeping it simple for now
    logsRes.body?.destroy(); // Close connection
  });
});
