import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { MockMCP, MockMcpServer, resetMocks } from "./test_helpers/mock_mcp_server.js";

// Mock dependencies
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// Mock @kubernetes/client-node
vi.mock("@kubernetes/client-node", () => {
    return {
        KubeConfig: class {
            loadFromDefault() {}
            makeApiClient() {
                return {
                    listNode: vi.fn().mockResolvedValue({
                        body: {
                            items: [
                                { metadata: { name: "node-1" }, status: { conditions: [{ type: "Ready", status: "True" }] } }
                            ]
                        }
                    }),
                    patchNode: vi.fn().mockResolvedValue({}),
                    listPodForAllNamespaces: vi.fn().mockResolvedValue({
                        body: {
                            items: [
                                { metadata: { name: "pod-1", namespace: "default" } }
                            ]
                        }
                    }),
                    deleteNamespacedPod: vi.fn().mockResolvedValue({}),
                    readNamespacedConfigMap: vi.fn().mockResolvedValue({
                        body: {
                            data: { failedRegions: "" }
                        }
                    }),
                    patchNamespacedConfigMap: vi.fn().mockResolvedValue({})
                };
            }
        },
        CoreV1Api: class {}
    };
});

// Mock axios
vi.mock("axios", () => {
    return {
        default: {
            post: vi.fn().mockRejectedValue(new Error("Simulated 500/400")),
            get: vi.fn().mockRejectedValue(new Error("Simulated 500"))
        }
    };
});

// Mock createLLM
vi.mock("../../src/llm.js", () => ({
    createLLM: () => ({
        generate: vi.fn().mockResolvedValue({ message: "## Compliance Report\n\nFailover triggered." }),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    })
}));

// Mock logMetric
const mockLogMetric = vi.fn();
vi.mock("../../src/logger.js", () => ({
    logMetric: mockLogMetric
}));

describe("Multi-Region Failover Simulation Integration Test", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();

        testRoot = await mkdtemp(join(tmpdir(), "multi-region-failover-"));
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

    it("should simulate a multi-region outage and verify recovery within 5 minutes", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        // Simulate outage in us-east-1
        const outageResult: any = await client.callTool({
            name: "simulate_regional_outage",
            arguments: {
                region: "us-east-1",
                failure_type: "node",
                duration_seconds: 180
            }
        });

        expect(outageResult.isError).toBeFalsy();
        const content = JSON.parse(outageResult.content[0].text);

        expect(content.status).toBe("Failover successful");
        expect(content.region).toBe("us-east-1");
        expect(content.failure_type).toBe("node");

        // Ensure recovery within 5 minutes SLA
        expect(content.recovery_time_seconds).toBeLessThan(300);
        expect(content.met_sla).toBe(true);

        expect(mockLogMetric).toHaveBeenCalledWith(
            "security_monitor",
            "regional_failover_recovery_time",
            expect.any(Number),
            expect.objectContaining({
                region: "us-east-1",
                failure_type: "node",
                met_sla: "true"
            })
        );
    });

    it("should gracefully handle secondary region outages (eu-west-1)", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        const outageResult: any = await client.callTool({
            name: "simulate_regional_outage",
            arguments: {
                region: "eu-west-1",
                failure_type: "network",
                duration_seconds: 60
            }
        });

        expect(outageResult.isError).toBeFalsy();
        const content = JSON.parse(outageResult.content[0].text);

        expect(content.status).toBe("Failover successful");
        expect(content.region).toBe("eu-west-1");
        expect(content.failure_type).toBe("network");
        expect(content.met_sla).toBe(true);
    });
});
