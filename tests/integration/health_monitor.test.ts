import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logMetric } from '../../src/logger.js';
import { unlink, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const AGENT_DIR = join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');
const ALERT_RULES_DIR = join(AGENT_DIR, 'health');

// Helper to clean up metrics
async function cleanup() {
  try {
      if (existsSync(METRICS_DIR)) {
          await rm(METRICS_DIR, { recursive: true, force: true });
      }
      if (existsSync(ALERT_RULES_DIR)) {
          await rm(ALERT_RULES_DIR, { recursive: true, force: true });
      }
  } catch {}
}

describe('Health Monitor Integration', () => {
    beforeEach(async () => {
        await cleanup();
        await mkdir(METRICS_DIR, { recursive: true });
        await mkdir(ALERT_RULES_DIR, { recursive: true });
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
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", "src/mcp_servers/health_monitor/index.ts"]
        });
        const client = new Client({ name: "test", version: "1.0" }, { capabilities: {} });
        await client.connect(transport);

        try {
            await client.callTool({
                name: "alert_on_threshold",
                arguments: {
                    metric: "test_metric",
                    threshold: 100,
                    operator: ">",
                    contact: "test"
                }
            });

            await client.callTool({
                name: "track_metric",
                arguments: {
                    agent: "test",
                    metric: "test_metric",
                    value: 150
                }
            });

            await new Promise(r => setTimeout(r, 500));

            const result: any = await client.callTool({
                name: "get_active_alerts",
                arguments: {}
            });

            const content = result.content[0].text;
            expect(content).toContain("test_metric");
            expect(content).toContain("150");
            expect(content).toContain("active");
        } finally {
            await client.close();
            // Force transport cleanup?
        }
    }, 20000);
});
