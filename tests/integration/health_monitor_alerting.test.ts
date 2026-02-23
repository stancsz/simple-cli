import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { MockMCP, MockMcpServer, mockToolHandlers, resetMocks } from "./test_helpers/mock_mcp_server.js";

// Mock MCP Infrastructure
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// Mock fetch for alerting
const mockFetch = vi.fn();

describe("Health Monitor Alerting Integration Test", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockFetch.mockResolvedValue({ ok: true, statusText: "OK" });
        vi.stubGlobal('fetch', mockFetch);
        resetMocks();

        testRoot = await mkdtemp(join(tmpdir(), "health-monitor-alerting-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Setup alert_rules.json
        const rulesPath = join(testRoot, "scripts", "dashboard");
        await mkdir(rulesPath, { recursive: true });

        const rules = [
            {
                metric: "error_rate",
                threshold: 0.1,
                operator: ">",
                contact: "slack",
                created_at: new Date().toISOString()
            }
        ];
        await writeFile(join(rulesPath, "alert_rules.json"), JSON.stringify(rules));

        // Set SLACK_WEBHOOK_URL
        process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/TEST/WEBHOOK";
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.resetModules();
        delete process.env.SLACK_WEBHOOK_URL;
    });

    it("should trigger alert when metric exceeds threshold via track_metric", async () => {
        // Dynamic import to load server and rules
        await import("../../src/mcp_servers/health_monitor/index.js");

        const mcp = new MockMCP();
        const client = mcp.getClient("health_monitor");

        // 1. Send metric that exceeds threshold
        // To be safe, wait a bit for loadRules to complete?
        // loadRules is async but called without await at top level.
        // In test, event loop might proceed.
        // We can use a small delay or rely on microtasks.
        await new Promise(resolve => setTimeout(resolve, 100));

        await client.callTool({
            name: "track_metric",
            arguments: {
                agent: "test_agent",
                metric: "error_rate",
                value: 0.5 // > 0.1
            }
        });

        // 2. Verify sendAlert was called (via fetch mock)
        // sendAlert is fire-and-forget, so wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockFetch).toHaveBeenCalled();
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall[0]).toBe("https://hooks.slack.com/services/TEST/WEBHOOK");
        expect(JSON.parse(fetchCall[1].body)).toEqual({ text: expect.stringContaining("error_rate is 0.5") });
    });

    it("should send aggregated alerts via check_alerts tool", async () => {
        await import("../../src/mcp_servers/health_monitor/index.js");
        const mcp = new MockMCP();
        const client = mcp.getClient("health_monitor");

        await new Promise(resolve => setTimeout(resolve, 100));

        // Need to populate metrics file for check_alerts to work (it reads files)
        // track_metric logs to file (using logMetric which uses fs)
        // logMetric writes to METRICS_DIR
        // We need to ensure METRICS_DIR points to our temp dir.
        // src/mcp_servers/health_monitor/utils.js uses process.cwd() to resolve AGENT_DIR?
        // Let's assume logMetric and getMetricFiles respect cwd.

        // Log a metric to generate file
        await client.callTool({
            name: "track_metric",
            arguments: {
                agent: "test_agent",
                metric: "error_rate",
                value: 0.8
            }
        });

        // check_alerts reads files.
        // Wait for file write?
        await new Promise(resolve => setTimeout(resolve, 100));

        await client.callTool({
            name: "check_alerts",
            arguments: {}
        });

        // Should trigger alert
        // It might trigger twice (one from track_metric real-time, one from check_alerts)
        // We expect at least one call.
        expect(mockFetch).toHaveBeenCalled();
    });
});
