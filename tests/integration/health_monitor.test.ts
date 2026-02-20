import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logMetric } from '../../src/logger.js';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const METRICS_DIR = join(process.cwd(), '.agent', 'metrics');
const ALERT_RULES_FILE = join(process.cwd(), 'scripts', 'dashboard', 'alert_rules.json');

// Helper to clean up metrics
async function cleanup() {
  if (existsSync(METRICS_DIR)) {
      // Delete files
      const files = await import('fs').then(fs => fs.promises.readdir(METRICS_DIR));
      for (const f of files) {
          if (f.endsWith('.ndjson')) await unlink(join(METRICS_DIR, f));
      }
  }
  if (existsSync(ALERT_RULES_FILE)) {
      await unlink(ALERT_RULES_FILE);
  }
}

describe('Health Monitor Integration', () => {
    beforeEach(async () => {
        await cleanup();
    });

    afterEach(async () => {
        await cleanup();
    });

    it('should log metrics to ndjson file', async () => {
        const agent = 'test_agent';
        const metric = 'test_metric';
        const value = 123;

        await logMetric(agent, metric, value, { tag: 'test' });

        // Allow FS to flush
        await new Promise(r => setTimeout(r, 100));

        const date = new Date().toISOString().split('T')[0];
        const filename = join(METRICS_DIR, `${date}.ndjson`);

        expect(existsSync(filename)).toBe(true);
        const content = await readFile(filename, 'utf-8');
        const entry = JSON.parse(content.trim());

        expect(entry.agent).toBe(agent);
        expect(entry.metric).toBe(metric);
        expect(entry.value).toBe(value);
        expect(entry.tags).toEqual({ tag: 'test' });
    });

    it('should trigger alerts on threshold breach', async () => {
        // 1. Set up alert rule
        const rule = [{
            metric: 'test_metric',
            threshold: 100,
            operator: '>',
            contact: 'test'
        }];

        if (!existsSync(join(process.cwd(), 'scripts', 'dashboard'))) {
            await mkdir(join(process.cwd(), 'scripts', 'dashboard'), { recursive: true });
        }
        await writeFile(ALERT_RULES_FILE, JSON.stringify(rule));

        // 2. Log metric that breaches threshold
        await logMetric('test', 'test_metric', 150);
        await new Promise(r => setTimeout(r, 100));

        // 3. Run check_alerts tool via MCP Client
        const client = new Client({ name: "test", version: "1.0" }, { capabilities: {} });
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", "src/mcp_servers/health_monitor/index.ts"]
        });

        await client.connect(transport);

        const result: any = await client.callTool({
            name: "check_alerts",
            arguments: {}
        });

        await client.close();

        expect(result.content[0].text).toContain("ALERT: test_metric is 150.00 (> 100)");
    }, 20000);

    it('dashboard API should return aggregated metrics', async () => {
        await logMetric('api_test', 'latency', 200);
        await new Promise(r => setTimeout(r, 100));

        // Start dashboard server
        const { spawn } = await import('child_process');
        const serverProcess = spawn('node', ['scripts/dashboard/server.js'], {
            stdio: 'pipe'
        });

        let started = false;

        serverProcess.stdout?.on('data', (d) => {
            if (d.toString().includes('running')) started = true;
        });
        serverProcess.stderr?.on('data', (d) => console.error(`[Server Error] ${d}`));

        // Wait for server to start
        for (let i = 0; i < 20; i++) {
            if (started) break;
            await new Promise(r => setTimeout(r, 100));
        }

        try {
            const res = await fetch('http://localhost:3003/api/metrics?timeframe=last_hour');
            const data: any = await res.json();

            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThan(0);
            expect(data[0].metric).toBe('latency');
            expect(data[0].value).toBe(200);
        } finally {
            serverProcess.kill();
        }
    });

    it('performance benchmark: logMetric overhead', async () => {
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            await logMetric('bench', 'test', i);
        }
        const end = performance.now();
        const duration = end - start;
        const avg = duration / 100;

        console.log(`[Benchmark] logMetric avg time: ${avg.toFixed(3)}ms`);
        expect(avg).toBeLessThan(50); // Constraint: < 50ms
    });
});
