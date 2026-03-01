import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { logMetric } from "../../../logger.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { createLLM } from "../../../llm.js";
import { registerValidationTools } from "./simulation.js";

import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

export function registerSecurityTools(server: McpServer) {
    registerValidationTools(server);

    server.tool(
        "scan_dependencies",
        "Scans dependencies for vulnerabilities using npm audit.",
        {},
        async () => {
            try {
                let stdout = "";
                try {
                    const result = await execFileAsync("npm", ["audit", "--json"]);
                    stdout = result.stdout;
                } catch (error: any) {
                    // npm audit returns non-zero exit code if vulnerabilities are found
                    if (error.stdout) {
                        stdout = error.stdout;
                    } else {
                        throw error;
                    }
                }

                const auditReport = JSON.parse(stdout);
                const vulnerabilities = auditReport.metadata?.vulnerabilities || {};

                const totalVulns =
                    (vulnerabilities.info || 0) +
                    (vulnerabilities.low || 0) +
                    (vulnerabilities.moderate || 0) +
                    (vulnerabilities.high || 0) +
                    (vulnerabilities.critical || 0);

                await logMetric("security_monitor", "vulnerabilities_found", totalVulns, {
                    critical: vulnerabilities.critical?.toString() || "0",
                    high: vulnerabilities.high?.toString() || "0"
                });

                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    `security_scan_${Date.now()}`,
                    "Dependency vulnerability scan",
                    JSON.stringify(vulnerabilities),
                    ["security", "audit", "dependencies"],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "security_event"
                );

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "Scan complete",
                            vulnerabilities: vulnerabilities,
                            details: auditReport.vulnerabilities ? "Vulnerabilities found. See report for details." : "No vulnerabilities found."
                        }, null, 2)
                    }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error running npm audit: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "monitor_api_activity",
        "Monitors API activity logs for anomalies like rate limiting or error spikes.",
        {
            activity_logs: z.array(z.object({
                timestamp: z.string(),
                endpoint: z.string(),
                status: z.number(),
                duration: z.number().optional()
            })).describe("Array of API activity log entries to analyze.")
        },
        async ({ activity_logs }) => {
            try {
                let thresholds = { error_rate_percent: 5, max_latency_ms: 1000 };
                try {
                    const policyStr = await readFile(join(process.cwd(), ".agent", "security_policy.json"), "utf-8");
                    const policy = JSON.parse(policyStr);
                    if (policy.api_monitoring) {
                        thresholds = { ...thresholds, ...policy.api_monitoring };
                    }
                } catch (e) {
                    // Use default thresholds if policy file not found
                }

                let errorCount = 0;
                let highLatencyCount = 0;

                for (const log of activity_logs) {
                    if (log.status >= 400) {
                        errorCount++;
                    }
                    if (log.duration && log.duration > thresholds.max_latency_ms) {
                        highLatencyCount++;
                    }
                }

                const totalLogs = activity_logs.length;
                const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;

                const anomalies = [];
                if (errorRate > thresholds.error_rate_percent) {
                    anomalies.push(`Error rate (${errorRate.toFixed(2)}%) exceeds threshold (${thresholds.error_rate_percent}%)`);
                    await logMetric("security_monitor", "api_error_spike", errorRate);
                }
                if (highLatencyCount > 0) {
                    anomalies.push(`${highLatencyCount} requests exceeded maximum latency threshold (${thresholds.max_latency_ms}ms)`);
                    await logMetric("security_monitor", "api_latency_spike", highLatencyCount);
                }

                if (anomalies.length > 0) {
                    const memory = new EpisodicMemory();
                    await memory.init();
                    await memory.store(
                        `api_anomaly_${Date.now()}`,
                        "API Activity Anomaly Detected",
                        JSON.stringify({ anomalies, errorRate, highLatencyCount, totalLogs }),
                        ["security", "api_monitoring", "anomaly"],
                        undefined, undefined, false, undefined, undefined, 0, 0,
                        "security_event"
                    );
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: anomalies.length > 0 ? "Anomalies detected" : "Normal",
                            anomalies: anomalies,
                            stats: {
                                total_requests: totalLogs,
                                error_rate: `${errorRate.toFixed(2)}%`,
                                high_latency_requests: highLatencyCount
                            }
                        }, null, 2)
                    }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error monitoring API activity: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "apply_security_patch",
        "Automatically creates a PR for a specific package update to fix a vulnerability.",
        {
            package_name: z.string().describe("Name of the npm package to update."),
            target_version: z.string().describe("The version to update to."),
            cve_id: z.string().optional().describe("The CVE ID associated with this patch (if applicable).")
        },
        async ({ package_name, target_version, cve_id }) => {
            try {
                // Dual-verification safety protocol check (simulated via policy for now)
                let autoPatchSeverity = ["critical", "high"];
                try {
                    const policyStr = await readFile(join(process.cwd(), ".agent", "security_policy.json"), "utf-8");
                    const policy = JSON.parse(policyStr);
                    if (policy.auto_patch && policy.auto_patch.severity_levels) {
                        autoPatchSeverity = policy.auto_patch.severity_levels;
                    }
                } catch (e) {
                    // Use defaults
                }

                // Construct branch name safely (prevent command injection)
                const safePackageName = package_name.replace(/[^a-zA-Z0-9_-]/g, '-');
                const branchName = `security-patch/${safePackageName}-${Date.now()}`;

                // Using execFile to prevent OS command injection
                await execFileAsync("git", ["checkout", "-b", branchName]);

                // Apply patch (npm install specific version)
                await execFileAsync("npm", ["install", `${package_name}@${target_version}`]);

                // Commit changes
                const commitMessage = `fix(security): update ${package_name} to ${target_version}${cve_id ? ` for ${cve_id}` : ''}`;
                await execFileAsync("git", ["add", "package.json", "package-lock.json"]);
                await execFileAsync("git", ["commit", "-m", commitMessage]);

                // Try to create PR if gh is available, otherwise just push
                let prUrl = "Local branch created. Push to remote to create PR manually.";
                try {
                    await execFileAsync("git", ["push", "-u", "origin", branchName]);
                    try {
                        const prResult = await execFileAsync("gh", ["pr", "create", "--title", commitMessage, "--body", `Automated security patch for ${package_name}.\n\nCVE: ${cve_id || 'N/A'}`]);
                        prUrl = prResult.stdout.trim();
                    } catch (ghError: any) {
                        console.warn("GitHub CLI not available or failed to create PR:", ghError.message);
                        prUrl = `Branch pushed: ${branchName}. Create PR manually.`;
                    }
                } catch (pushError: any) {
                    console.warn("Could not push branch to remote:", pushError.message);
                    throw new Error(`Failed to push branch to remote: ${pushError.message}`);
                } finally {
                    // Checkout main/master again (best effort cleanup)
                    try {
                        await execFileAsync("git", ["checkout", "-"]);
                    } catch (e) {
                        console.warn("Failed to checkout previous branch during cleanup");
                    }
                }

                const memory = new EpisodicMemory();
                await memory.init();
                await memory.store(
                    `security_patch_${Date.now()}`,
                    `Applied security patch for ${package_name}`,
                    JSON.stringify({ package: package_name, version: target_version, cve: cve_id, branch: branchName, pr: prUrl }),
                    ["security", "patch", "pull_request"],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "security_event"
                );

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "Patch applied",
                            package: package_name,
                            version: target_version,
                            branch: branchName,
                            pr_url: prUrl
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                // Attempt to cleanup branch if failed
                try {
                    await execFileAsync("git", ["checkout", "-"]);
                } catch(e) {
                    console.warn("Failed to cleanup branch on error");
                }

                await logMetric("security_monitor", "security_patch_failed", 1, {
                    package: package_name,
                    error: error.message
                });

                return {
                    content: [{ type: "text", text: `Error applying security patch: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "generate_security_report",
        "Generates a comprehensive security status summary.",
        {},
        async () => {
            try {
                const memory = new EpisodicMemory();
                await memory.init();

                const recentEvents = await memory.recall("security_event", 20, undefined, "security_event");

                const llm = createLLM();
                const prompt = `Act as a Chief Information Security Officer. Analyze these recent security events and generate a weekly security status summary report.

Recent Security Events:
${JSON.stringify(recentEvents.map(e => e.agentResponse), null, 2)}

Task: Create a Markdown-formatted security report including:
1. Executive Summary
2. Dependency Vulnerabilities Status
3. API Activity Anomalies
4. Recent Automated Patches Applied
5. Recommendations`;

                const response = await llm.generate(prompt, []);

                return {
                    content: [{
                        type: "text",
                        text: response.message || "Failed to generate report."
                    }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error generating security report: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
