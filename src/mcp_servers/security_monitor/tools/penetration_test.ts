import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { logMetric } from "../../../logger.js";
import { readFile } from "fs/promises";
import { join } from "path";

// Simulates sending attack vectors to monitor_api_activity
async function simulateAttacks(targetUrl: string, vectors: string[]): Promise<any[]> {
    const syntheticLogs: any[] = [];
    for (const vector of vectors) {
        if (vector === 'sqli') {
            syntheticLogs.push({ timestamp: new Date().toISOString(), endpoint: targetUrl, status: 500, duration: 1500, payload: "'; DROP TABLE users; --" });
            syntheticLogs.push({ timestamp: new Date().toISOString(), endpoint: targetUrl, status: 500, duration: 2500, payload: "admin' OR '1'='1" });
        } else if (vector === 'xss') {
            syntheticLogs.push({ timestamp: new Date().toISOString(), endpoint: targetUrl, status: 400, duration: 150, payload: "<script>alert(1)</script>" });
        } else if (vector === 'credential_stuffing') {
            for (let i = 0; i < 20; i++) {
                syntheticLogs.push({ timestamp: new Date().toISOString(), endpoint: `${targetUrl}/login`, status: 401, duration: 100, payload: `user${i}:pass123` });
            }
        }
    }
    return syntheticLogs;
}

export function registerPenetrationTestTool(server: McpServer) {
    server.tool(
        "run_penetration_test",
        "Executes a simulated penetration test against the agency's API endpoints using specified attack vectors.",
        {
            target_url: z.string().describe("The target URL or API endpoint to test."),
            attack_vectors: z.array(z.string()).describe("List of attack vectors to simulate (e.g., 'sqli', 'xss', 'credential_stuffing').")
        },
        async ({ target_url, attack_vectors }) => {
            try {
                // 1. Generate Synthetic Attacks
                const syntheticLogs = await simulateAttacks(target_url, attack_vectors);

                // 2. Pass logs to Anomaly Detection logic
                let thresholds = { error_rate_percent: 5, max_latency_ms: 1000 };
                try {
                    const policyStr = await readFile(join(process.cwd(), ".agent", "security_policy.json"), "utf-8");
                    const policy = JSON.parse(policyStr);
                    if (policy.api_monitoring) {
                        thresholds = { ...thresholds, ...policy.api_monitoring };
                    }
                } catch (e) {
                    // Default
                }

                let errorCount = 0;
                let highLatencyCount = 0;

                for (const log of syntheticLogs) {
                    if (log.status >= 400) errorCount++;
                    if (log.duration && log.duration > thresholds.max_latency_ms) highLatencyCount++;
                }

                const totalLogs = syntheticLogs.length;
                const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;
                const anomaliesDetected = errorRate > thresholds.error_rate_percent || highLatencyCount > 0;

                // 3. Store Penetration Test Result in memory
                const memory = new EpisodicMemory();
                await memory.init();
                const testResultId = `pentest_${Date.now()}`;
                await memory.store(
                    testResultId,
                    `Penetration Test against ${target_url}`,
                    JSON.stringify({ target_url, attack_vectors, anomaliesDetected, errorRate, highLatencyCount, totalLogs }),
                    ["security", "penetration_test", "compliance"],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "security_event"
                );

                // 4. Generate Compliance Report using LLM
                const llm = createLLM();
                const prompt = `Act as an expert Security Penetration Tester. Review the following simulated penetration test results and generate a concise compliance report. Include vulnerability scores (CVSS-style) for any successful vectors, and confirm whether the security monitoring system successfully detected the anomalous activity.

                Test Results:
                Target URL: ${target_url}
                Attack Vectors Simulated: ${attack_vectors.join(", ")}
                Total Payloads Sent: ${totalLogs}
                Anomalies Detected by Monitor: ${anomaliesDetected ? "Yes" : "No"}
                Error Rate: ${errorRate.toFixed(2)}%
                High Latency Requests: ${highLatencyCount}

                Generate a Markdown formatted report.`;

                const reportResponse = await llm.generate(prompt, []);

                // 5. Return Report
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "Penetration test complete",
                            target_url,
                            anomalies_detected: anomaliesDetected,
                            report: reportResponse.message || "Failed to generate report"
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error running penetration test: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
