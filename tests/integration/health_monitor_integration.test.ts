import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from 'path';
import { existsSync, rmSync } from 'fs';

const AGENT_DIR = join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');

describe('Health Monitor Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Clean up metrics before test
    if (existsSync(METRICS_DIR)) {
        // We don't want to delete everything if running in a real env,
        // but for test isolation it's good.
        // Let's assume test env is safe to clean or we just filter by agent.
    }

    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/mcp_servers/health_monitor/index.ts"],
      env: { ...process.env } // Ensure no PORT env so it runs in Stdio mode
    });

    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('should track a metric', async () => {
    const result: any = await client.callTool({
      name: "track_metric",
      arguments: {
        agent: "test_agent",
        metric: "test_latency",
        value: 123,
        tags: { env: "test" }
      }
    });

    expect(result.content[0].text).toContain("Metric test_latency tracked");
  });

  it('should retrieve metrics', async () => {
    // Wait a bit for file write (async)
    await new Promise(resolve => setTimeout(resolve, 500));

    const result: any = await client.callTool({
      name: "get_metrics",
      arguments: {
        timeframe: "last_hour"
      }
    });

    const metrics = JSON.parse(result.content[0].text);
    expect(Array.isArray(metrics)).toBe(true);
    const found = metrics.find((m: any) => m.agent === "test_agent" && m.metric === "test_latency");
    expect(found).toBeDefined();
    expect(found.value).toBe(123);
  });

  it('should configure an alert', async () => {
    const result: any = await client.callTool({
      name: "alert_on_threshold",
      arguments: {
        metric: "test_latency",
        threshold: 100,
        operator: ">"
      }
    });

    expect(result.content[0].text).toContain("Alert rule added");
  });

  it('should trigger an alert', async () => {
    // Trigger check
    const result: any = await client.callTool({
      name: "check_alerts",
      arguments: {}
    });

    // Should trigger because 123 > 100
    expect(result.content[0].text).toContain("ALERT: test_latency is 123");
  });
});
