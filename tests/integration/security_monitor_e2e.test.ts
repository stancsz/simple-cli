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

describe("Security Monitor E2E Workflow", () => {
    let testRoot: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();

        testRoot = await mkdtemp(join(tmpdir(), "security-monitor-e2e-"));
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

    it("should execute full lifecycle: detect vulnerability -> detect anomaly -> patch PR", async () => {
        const { SecurityMonitorServer } = await import("../../src/mcp_servers/security_monitor/index.js");
        new SecurityMonitorServer();
        const mcp = new MockMCP();
        const client = mcp.getClient("security_monitor");

        // 1. Simulate Dependency Scan with Critical CVE
        const mockAudit = {
            metadata: {
                vulnerabilities: {
                    info: 0,
                    low: 0,
                    moderate: 0,
                    high: 0,
                    critical: 1
                }
            },
            vulnerabilities: {
                "express": {
                    severity: "critical",
                    via: [{ source: 1234, name: "express", dependency: "express", title: "RCE Vulnerability" }]
                }
            }
        };

        mockExecFileAsync.mockRejectedValueOnce({
            stdout: JSON.stringify(mockAudit),
            code: 1
        });

        const scanResult: any = await client.callTool({
            name: "scan_dependencies",
            arguments: {}
        });

        expect(scanResult.isError).toBeFalsy();
        const scanContent = JSON.parse(scanResult.content[0].text);
        expect(scanContent.status).toBe("Scan complete");
        expect(scanContent.vulnerabilities.critical).toBe(1);

        expect(mockLogMetric).toHaveBeenCalledWith("security_monitor", "vulnerabilities_found", 1, {
            critical: "1",
            high: "0"
        });

        // 2. Simulate API Activity Monitoring with anomalies
        const mockLogs = [
            { timestamp: "2023-10-01T10:00:00Z", endpoint: "/api/login", status: 200, duration: 150 },
            { timestamp: "2023-10-01T10:01:00Z", endpoint: "/api/login", status: 500, duration: 200 }, // Error
            { timestamp: "2023-10-01T10:02:00Z", endpoint: "/api/login", status: 500, duration: 1200 }, // High latency + Error
            { timestamp: "2023-10-01T10:03:00Z", endpoint: "/api/login", status: 200, duration: 300 }
        ];

        const monitorResult: any = await client.callTool({
            name: "monitor_api_activity",
            arguments: { activity_logs: mockLogs }
        });

        expect(monitorResult.isError).toBeFalsy();
        const monitorContent = JSON.parse(monitorResult.content[0].text);
        expect(monitorContent.status).toBe("Anomalies detected");
        expect(monitorContent.stats.error_rate).toBe("50.00%");

        // 3. Apply Security Patch (Automated PR)
        // Reset mock implementations for patch
        mockExecFileAsync.mockImplementation(async (cmd, args) => {
            if (cmd === 'git') {
                if (args[0] === 'push') return { stdout: 'branch pushed' };
                if (args[0] === 'checkout') return { stdout: 'checked out' };
                if (args[0] === 'add') return { stdout: 'added' };
                if (args[0] === 'commit') return { stdout: 'committed' };
            }
            if (cmd === 'npm' && args[0] === 'install') return { stdout: 'installed' };
            if (cmd === 'gh' && args[0] === 'pr') return { stdout: 'https://github.com/agency/repo/pull/999' };
            return { stdout: 'success' };
        });

        const patchResult: any = await client.callTool({
            name: "apply_security_patch",
            arguments: {
                package_name: "express",
                target_version: "4.19.2",
                cve_id: "CVE-2024-12345"
            }
        });

        expect(patchResult.isError).toBeFalsy();
        const patchContent = JSON.parse(patchResult.content[0].text);
        expect(patchContent.status).toBe("Patch applied");
        expect(patchContent.package).toBe("express");
        expect(patchContent.pr_url).toBe("https://github.com/agency/repo/pull/999");

        // 4. Generate report to verify all events were logged to memory
        const reportResult: any = await client.callTool({
            name: "generate_security_report",
            arguments: {}
        });

        expect(reportResult.isError).toBeFalsy();
        expect(reportResult.content[0].text).toContain("## Security Report");
    });
});
