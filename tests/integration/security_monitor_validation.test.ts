import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../../src/mcp_servers/security_monitor/tools/index.js';
import * as child_process from 'child_process';
import fetch from 'node-fetch';
import * as utils from '../../src/mcp_servers/health_monitor/utils.js';

// Mock child_process for npm audit and git commands
vi.mock('child_process', () => ({
    exec: vi.fn(),
    execFile: vi.fn()
}));

// Mock fetch for GitHub API
vi.mock('node-fetch');

// Mock llm
vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn(() => ({
        generate: vi.fn().mockResolvedValue({ message: "Mocked LLM Summary: System is secure." })
    }))
}));

// Mock health monitor utils
vi.mock('../../src/mcp_servers/health_monitor/utils.js', () => ({
    getMetricFiles: vi.fn(),
    readNdjson: vi.fn()
}));

describe('Security Monitor MCP Validation', () => {
    let server: McpServer;

    let getTool: (name: string) => any;

    beforeEach(() => {
        vi.clearAllMocks();
        server = {
             tool: vi.fn()
        } as unknown as McpServer;
        registerTools(server);

        getTool = (name: string) => {
            let handler;
            // @ts-ignore
            const call = server.tool.mock.calls.find(c => c[0] === name);
            if (call) {
                handler = call[3];
                return { handler: (args: any) => handler(args, { request: {} }) };
            }
            return undefined;
        };
    });

    it('scan_dependencies should parse npm audit output and summarize', async () => {
        // Mock audit output
        const mockAuditJson = {
            metadata: {
                vulnerabilities: {
                    critical: 1,
                    high: 2,
                    moderate: 5,
                    low: 10
                },
                dependencies: {
                    total: 100
                }
            }
        };

        // @ts-ignore
        child_process.exec.mockImplementation((cmd, options, callback) => {
            const cb = callback || options;
            if (cmd.includes('npm audit --json')) {
                if (typeof cb === 'function') {
                    cb(null, { stdout: JSON.stringify(mockAuditJson), stderr: '' });
                } else if (typeof options === 'function') {
                    options(null, { stdout: JSON.stringify(mockAuditJson), stderr: '' });
                }
                return { stdout: JSON.stringify(mockAuditJson) }; // For promisify
            }
            if (typeof cb === 'function') {
                cb(null, { stdout: "" });
            }
            return { stdout: "" };
        });

        const scanDependenciesTool = getTool("scan_dependencies");
        expect(scanDependenciesTool).toBeDefined();
        // @ts-ignore
        const result = await scanDependenciesTool.handler({});

        expect(result.isError).toBeUndefined();
        const content = JSON.parse(result.content[0].text);

        expect(content.vulnerabilities.critical).toBe(1);
        expect(content.vulnerabilities.high).toBe(2);
        expect(content.totalDependencies).toBe(100);
        expect(content.summary).toBe("Mocked LLM Summary: System is secure.");
    });

    it('monitor_api_activity should detect anomalies in failed requests', async () => {
        // Create 24 hours of normal baseline data (average ~10 errors)
        const mockMetrics = [];
        const now = new Date();
        for (let i = 24; i > 1; i--) {
            const date = new Date(now.getTime() - i * 60 * 60 * 1000);
            mockMetrics.push({
                metric: 'error_count',
                agent: 'system',
                value: 10 + (Math.random() * 2 - 1), // 9 to 11
                timestamp: date.toISOString()
            });
        }

        // Add a massive spike in the current hour
        mockMetrics.push({
            metric: 'error_count',
            agent: 'system',
            value: 100, // Spike!
            timestamp: now.toISOString()
        });

        // @ts-ignore
        utils.getMetricFiles.mockResolvedValue(['mock-file.ndjson']);
        // @ts-ignore
        utils.readNdjson.mockResolvedValue(mockMetrics);

        const monitorTool = getTool("monitor_api_activity");
        expect(monitorTool).toBeDefined();
        // @ts-ignore
        const result = await monitorTool.handler({});

        expect(result.isError).toBeUndefined();
        const content = JSON.parse(result.content[0].text);

        expect(content.anomalies.length).toBeGreaterThan(0);
        const anomaly = content.anomalies[0];
        expect(anomaly.value).toBe(100);
        expect(anomaly.isAnomaly).toBe(true);
        expect(anomaly.baselineAverage).toBeLessThan(20);
    });

    it('apply_security_patch should create branch and open PR', async () => {
        process.env.GITHUB_TOKEN = 'mock-token';

        // @ts-ignore
        child_process.execFile.mockImplementation((cmd, args, callback) => {
            const cb = typeof callback === 'function' ? callback : (typeof args === 'function' ? args : undefined);
            if (cmd === 'git' && args.includes('config')) {
                if (cb) cb(null, { stdout: "git@github.com:mock-org/mock-repo.git\n" });
                return { stdout: "git@github.com:mock-org/mock-repo.git\n" };
            }
            if (cb) cb(null, { stdout: "success" });
            return { stdout: "success" };
        });

        // Mock fetch response for GitHub API
        const mockFetchResponse = {
            ok: true,
            json: vi.fn().mockResolvedValue({ html_url: "https://github.com/mock-org/mock-repo/pull/1" })
        };
        // @ts-ignore
        fetch.mockResolvedValue(mockFetchResponse);

        const patchTool = getTool("apply_security_patch");
        expect(patchTool).toBeDefined();
        // @ts-ignore
        const result = await patchTool.handler({
            package_name: 'lodash',
            version: '4.17.21',
            cve_id: 'CVE-2021-23337',
            severity: 'high'
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Successfully patched lodash");
        expect(result.content[0].text).toContain("https://github.com/mock-org/mock-repo/pull/1");

        // Verify git commands were executed
        expect(child_process.execFile).toHaveBeenCalledWith('git', expect.arrayContaining(['checkout', '-b', 'security-patch-lodash-4-17-21']), expect.anything());
        expect(child_process.execFile).toHaveBeenCalledWith('npm', expect.arrayContaining(['install', 'lodash@4.17.21']), expect.anything());

        // Verify GitHub API was called
        expect(fetch).toHaveBeenCalledWith(
            "https://api.github.com/repos/mock-org/mock-repo/pulls",
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'token mock-token'
                })
            })
        );
    });
});
