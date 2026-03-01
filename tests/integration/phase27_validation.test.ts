import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { MockMCP, MockMcpServer, resetMocks } from "./test_helpers/mock_mcp_server.js";

// Mock dependencies
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// Mock createLLM
vi.mock("../../src/llm.js", () => ({
    createLLM: () => ({
        generate: vi.fn().mockResolvedValue({ message: "## Compliance Report\n\nPenetration test detected 3 anomalies. Monitor reacted correctly." }),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    })
}));

// Mock logMetric
const mockLogMetric = vi.fn();
vi.mock("../../src/logger.js", () => ({
    logMetric: mockLogMetric
}));

describe("Phase 27 Validation: Regional Outage & Penetration Testing", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();

        testRoot = await mkdtemp(join(tmpdir(), "phase27-validation-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Mock security policy
        const policyDir = join(testRoot, ".agent");
        await mkdir(policyDir, { recursive: true });
        await writeFile(join(policyDir, "security_policy.json"), JSON.stringify({
            api_monitoring: { error_rate_percent: 5, max_latency_ms: 1000 }
        }));
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should simulate a regional outage and verify failover", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        const outageResult: any = await client.callTool({
            name: "simulate_regional_outage",
            arguments: {
                region: "eu-west-1",
                failure_type: "node",
                duration_seconds: 120
            }
        });

        expect(outageResult.isError).toBeFalsy();
        const content = JSON.parse(outageResult.content[0].text);

        expect(content.status).toBe("Failover successful");
        expect(content.region).toBe("eu-west-1");
        expect(content.failure_type).toBe("node");
        expect(content.met_sla).toBe(true);
        expect(content.recovery_time_seconds).toBeGreaterThanOrEqual(10);
        expect(content.recovery_time_seconds).toBeLessThanOrEqual(60);

        // Verify metric was logged
        expect(mockLogMetric).toHaveBeenCalledWith(
            "security_monitor",
            "regional_failover_recovery_time",
            expect.any(Number),
            expect.objectContaining({
                region: "eu-west-1",
                failure_type: "node",
                met_sla: "true"
            })
        );
    });

    it("should run penetration test and detect anomalies", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        const pentestResult: any = await client.callTool({
            name: "run_penetration_test",
            arguments: {
                target_url: "https://api.agency.com",
                attack_vectors: ["sqli", "xss"]
            }
        });

        expect(pentestResult.isError).toBeFalsy();
        const content = JSON.parse(pentestResult.content[0].text);

        expect(content.status).toBe("Penetration test complete");
        expect(content.target_url).toBe("https://api.agency.com");
        expect(content.anomalies_detected).toBe(true);
        expect(content.report).toContain("Compliance Report");
    });
});
