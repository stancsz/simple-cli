import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { createLLM } from "../../../llm.js";
import { VulnerabilityReport } from "../types.js";

const execAsync = promisify(exec);

export function registerScanDependenciesTool(server: McpServer) {
    server.tool(
        "scan_dependencies",
        "Scans project dependencies for vulnerabilities using npm audit.",
        {},
        async () => {
            try {
                // Execute npm audit, but don't fail if there are vulnerabilities (exit code > 0)
                let stdout = "";
                try {
                    const result = await execAsync("npm audit --json", { maxBuffer: 1024 * 1024 * 10 });
                    stdout = result.stdout;
                } catch (e: any) {
                    if (e.stdout) {
                        stdout = e.stdout;
                    } else {
                        throw e;
                    }
                }

                if (!stdout) {
                    return {
                        content: [{ type: "text", text: JSON.stringify({ error: "Failed to get npm audit output" }) }],
                        isError: true
                    };
                }

                const auditResult = JSON.parse(stdout);

                let critical = 0;
                let high = 0;
                let moderate = 0;
                let low = 0;
                let totalDependencies = 0;

                if (auditResult.metadata && auditResult.metadata.vulnerabilities) {
                    const vulns = auditResult.metadata.vulnerabilities;
                    critical = vulns.critical || 0;
                    high = vulns.high || 0;
                    moderate = vulns.moderate || 0;
                    low = vulns.low || 0;
                    totalDependencies = auditResult.metadata.dependencies?.total || 0;
                }

                // Summarize with LLM
                const llm = createLLM();
                let summary = "";
                try {
                    const prompt = `Analyze the following npm audit summary and provide a concise, professional 2-3 sentence summary of the security posture.
                    Critical: ${critical}, High: ${high}, Moderate: ${moderate}, Low: ${low}. Total Dependencies: ${totalDependencies}.`;

                    const response = await llm.generate(prompt, []);
                    summary = response.message || response.thought || "Analysis completed.";
                } catch (e) {
                    summary = "LLM analysis failed, returning raw counts.";
                    console.error("LLM Error in scan_dependencies:", e);
                }

                const report: VulnerabilityReport = {
                    vulnerabilities: {
                        critical,
                        high,
                        moderate,
                        low
                    },
                    totalDependencies,
                    summary
                };

                return {
                    content: [{ type: "text", text: JSON.stringify(report, null, 2) }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error scanning dependencies: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
