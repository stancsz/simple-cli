import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { MockMCP, MockMcpServer, mockToolHandlers, resetMocks } from "./test_helpers/mock_mcp_server.js";

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
        generate: vi.fn().mockResolvedValue({ message: "## Security Report\n\nAll clear." }),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    })
}));

// Mock logMetric
const mockLogMetric = vi.fn();
vi.mock("../../src/logger.js", () => ({
    logMetric: mockLogMetric
}));

// Mock child_process execFile Async
const mockExecFileAsync = vi.fn();
vi.mock("util", async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        promisify: (fn: any) => {
            if (fn.name === 'execFile') return mockExecFileAsync;
            return actual.promisify(fn);
        }
    };
});

describe("Security Monitor Validation", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();

        testRoot = await mkdtemp(join(tmpdir(), "security-monitor-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create mock security policy
        const policyDir = join(testRoot, ".agent");
        await mkdir(policyDir, { recursive: true });
        await writeFile(join(policyDir, "security_policy.json"), JSON.stringify({
            api_monitoring: { error_rate_percent: 5, max_latency_ms: 1000 },
            auto_patch: { severity_levels: ["critical", "high"] }
        }));
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should scan dependencies and detect vulnerabilities", async () => {
        // Mock npm audit output with a high vulnerability
        const mockAudit = {
            metadata: {
                vulnerabilities: {
                    info: 0,
                    low: 0,
                    moderate: 1,
                    high: 2,
                    critical: 0
                }
            },
            vulnerabilities: {
                "some-package": {
                    severity: "high"
                }
            }
        };

        // npm audit returns a non-zero exit code if vulnerabilities are found
        mockExecFileAsync.mockRejectedValueOnce({
            stdout: JSON.stringify(mockAudit),
            code: 1
        });

        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer(); // This initializes the server and registers tools
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        const result: any = await client.callTool({
            name: "scan_dependencies",
            arguments: {}
        });

        if (result.isError) {
             console.error("Tool returned error:", result.content[0].text);
        }

        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe("Scan complete");
        expect(content.vulnerabilities.high).toBe(2);

        // Verify metric logging
        expect(mockLogMetric).toHaveBeenCalledWith("security_monitor", "vulnerabilities_found", 3, {
            critical: "0",
            high: "2"
        });
    });

    it("should monitor api activity and detect anomalies", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        // Provide 10 logs: 2 errors (20% > 5% threshold), 1 slow request
        const mockLogs = [
            { timestamp: "2023-10-01T10:00:00Z", endpoint: "/api/users", status: 200, duration: 150 },
            { timestamp: "2023-10-01T10:01:00Z", endpoint: "/api/data", status: 500, duration: 200 },
            { timestamp: "2023-10-01T10:02:00Z", endpoint: "/api/auth", status: 401, duration: 1200 }, // High latency + Error
            { timestamp: "2023-10-01T10:03:00Z", endpoint: "/api/stats", status: 200, duration: 300 },
            { timestamp: "2023-10-01T10:04:00Z", endpoint: "/api/users", status: 200, duration: 100 },
            { timestamp: "2023-10-01T10:05:00Z", endpoint: "/api/users", status: 200, duration: 110 },
            { timestamp: "2023-10-01T10:06:00Z", endpoint: "/api/users", status: 200, duration: 105 },
            { timestamp: "2023-10-01T10:07:00Z", endpoint: "/api/users", status: 200, duration: 100 },
            { timestamp: "2023-10-01T10:08:00Z", endpoint: "/api/users", status: 200, duration: 95 },
            { timestamp: "2023-10-01T10:09:00Z", endpoint: "/api/users", status: 200, duration: 102 }
        ];

        const result: any = await client.callTool({
            name: "monitor_api_activity",
            arguments: { activity_logs: mockLogs }
        });

        if (result.isError) {
             console.error("Tool returned error:", result.content[0].text);
        }

        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe("Anomalies detected");
        expect(content.anomalies.length).toBe(2);
        expect(content.stats.error_rate).toBe("20.00%");

        expect(mockLogMetric).toHaveBeenCalledWith("security_monitor", "api_error_spike", 20);
        expect(mockLogMetric).toHaveBeenCalledWith("security_monitor", "api_latency_spike", 1);
    });

    it("should apply security patches and create PR", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        mockExecFileAsync.mockResolvedValue({ stdout: "https://github.com/test/repo/pull/123" });

        const result: any = await client.callTool({
            name: "apply_security_patch",
            arguments: {
                package_name: "lodash",
                target_version: "4.17.21",
                cve_id: "CVE-2021-1234"
            }
        });

        if (result.isError) {
             console.error("Tool returned error:", result.content[0].text);
        }

        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);

        expect(content.status).toBe("Patch applied");
        expect(content.package).toBe("lodash");
        expect(content.branch).toContain("security-patch/lodash-");
        expect(content.pr_url).toBe("https://github.com/test/repo/pull/123");

        // Verify git commands were called
        const gitCalls = mockExecFileAsync.mock.calls.filter(call => call[0] === 'git');
        expect(gitCalls.length).toBeGreaterThanOrEqual(4); // checkout, add, commit, push
    });

    it("should generate a security report", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        const result: any = await client.callTool({
            name: "generate_security_report",
            arguments: {}
        });

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain("## Security Report");
    });
});
