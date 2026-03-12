import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP } from "../../../mcp.js";
import { createLLM } from "../../../llm.js";
import { getFleetStatusLogic } from "./swarm_fleet_management.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { scaleSwarmLogic } from "../../scaling_engine/scaling_orchestrator.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

interface AllocationRecommendation {
    clientId: string;
    companyName: string;
    current_status: any;
    recommendation: "scale_up" | "scale_down" | "maintain" | "reallocate";
    reasoning: string;
    suggested_budget_adjustment?: number;
    predicted_roi?: string;
    confidence_score: number; // 0-100
}

interface AllocationResult {
    analysis_timestamp: string;
    recommendations: AllocationRecommendation[];
    execution_results?: any[];
}

export function registerResourceAllocationTools(server: McpServer, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "allocate_resources_optimally",
        "Predictive capacity management tool that analyzes demand and performance to recommend or execute swarm scaling.",
        {
            dry_run: z.boolean().default(true).describe("If true, only generates recommendations without executing scaling actions."),
            focus_clients: z.array(z.string()).optional().describe("Optional list of client IDs to restrict analysis to.")
        },
        async ({ dry_run, focus_clients }) => {
            const llm = createLLM();
            const results: AllocationResult = {
                analysis_timestamp: new Date().toISOString(),
                recommendations: [],
                execution_results: []
            };

            // 1. Gather Data (Fleet Status & Performance)
            let fleetStatus;
            try {
                fleetStatus = await getFleetStatusLogic();
            } catch (e) {
                return {
                    content: [{ type: "text", text: `Error fetching fleet status: ${(e as Error).message}` }],
                    isError: true
                };
            }

            // Filter if requested
            if (focus_clients && focus_clients.length > 0) {
                fleetStatus = fleetStatus.filter(s => focus_clients.includes(s.company) || focus_clients.includes(s.projectId));
            }

            // 2. Fetch Strategic Forecasts from Brain
            let recentForecasts: any[] = [];
            let brainClient: Client | null = null;
            try {
                const srcPath = join(process.cwd(), "src", "mcp_servers", "brain", "index.ts");
                const distPath = join(process.cwd(), "dist", "mcp_servers", "brain", "index.js");

                let command = "node";
                let args = [distPath];

                if (existsSync(srcPath) && !existsSync(distPath)) {
                  command = "npx";
                  args = ["tsx", srcPath];
                } else if (!existsSync(distPath)) {
                  throw new Error(`Brain MCP Server not found at ${srcPath} or ${distPath}`);
                }

                const transport = new StdioClientTransport({ command, args });
                brainClient = new Client({ name: "business_ops-brain-client", version: "1.0.0" }, { capabilities: {} });
                await brainClient.connect(transport);

                const forecastQuery: any = await brainClient.callTool({
                    name: "brain_query",
                    arguments: {
                        query: "Strategic Forecast",
                        limit: 5,
                        format: "json",
                        type: "strategic_forecast"
                    }
                });

                if (!forecastQuery.isError && forecastQuery.content && forecastQuery.content.length > 0) {
                    try {
                        const parsed = JSON.parse(forecastQuery.content[0].text);
                        // Filter recent forecasts (last 7 days approx)
                        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                        recentForecasts = parsed.filter((p: any) => p.timestamp >= sevenDaysAgo);
                    } catch(e) {}
                }
            } catch (e) {
                console.warn(`Failed to retrieve strategic forecasts: ${e}`);
            } finally {
                if (brainClient) {
                    try { await brainClient.close(); } catch {}
                }
            }

            // 3. Analyze each client context
            for (const status of fleetStatus) {
                // Collect detailed metrics
                let metrics;
                try {
                    metrics = await collectPerformanceMetrics("last_30_days", status.company);
                } catch (e) {
                    console.warn(`Failed to collect metrics for ${status.company}`, e);
                    // Continue with partial data
                }

                // Map relevant forecasts to this client if any
                // The strategic forecast might be namespaced or contain the company name in the request/solution
                const clientForecasts = recentForecasts.filter(f =>
                    (f.company && f.company === status.company) ||
                    (f.userPrompt && f.userPrompt.includes(status.company)) ||
                    (f.agentResponse && f.agentResponse.includes(status.company))
                );

                // Construct Analysis Prompt
                const context = {
                    client: status.company,
                    fleet_status: status,
                    performance_metrics: metrics,
                    market_context: "Assuming standard market growth and seasonal stability.", // Placeholder or fetch from market tool
                    strategic_forecasts: clientForecasts
                };

                const prompt = `
                    You are the Chief Operating Officer AI.
                    Analyze the following client swarm context and recommend resource allocation.

                    Context:
                    ${JSON.stringify(context, null, 2)}

                    Task:
                    Determine if we should Scale Up, Scale Down, Maintain, or Reallocate resources.
                    Consider profitability (margin), demand (pending issues), and client satisfaction (NPS).

                    Output:
                    Return ONLY a valid JSON object matching this interface:
                    {
                        "recommendation": "scale_up" | "scale_down" | "maintain" | "reallocate",
                        "reasoning": "string",
                        "suggested_budget_adjustment": number (percentage, e.g. 0.10 for +10%),
                        "predicted_roi": "string description",
                        "confidence_score": number (0-100)
                    }
                `;

                try {
                    const response = await llm.generate(prompt, []);
                    let analysis: any = {};

                    // Parse LLM response (handling potential markdown blocks)
                    const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        analysis = JSON.parse(jsonMatch[0]);
                    } else {
                         // Fallback safe defaults
                         analysis = {
                             recommendation: "maintain",
                             reasoning: "LLM failed to return structured JSON.",
                             confidence_score: 0
                         };
                    }

                    const rec: AllocationRecommendation = {
                        clientId: status.projectId,
                        companyName: status.company,
                        current_status: status,
                        ...analysis
                    };

                    results.recommendations.push(rec);

                } catch (e) {
                    console.error(`LLM Analysis failed for ${status.company}:`, e);
                }
            }

            // 3. Execute Actions (if not dry_run)
            if (!dry_run) {
                for (const rec of results.recommendations) {
                    if (rec.confidence_score < 70) continue; // Safety threshold

                    if (rec.recommendation === "scale_up") {
                        try {
                            const res = await scaleSwarmLogic(
                                mcp,
                                rec.companyName,
                                "spawn",
                                "specialist", // Default role
                                "Assist with high demand" // Default task
                            );
                            results.execution_results?.push({ company: rec.companyName, action: "spawn", result: res });
                        } catch (e) {
                            results.execution_results?.push({ company: rec.companyName, action: "spawn", error: (e as Error).message });
                        }
                    } else if (rec.recommendation === "scale_down") {
                        // Logic to find agent to terminate is complex without state.
                        // We will log intent for now or try best effort if ID is known (it's not here).
                        results.execution_results?.push({
                            company: rec.companyName,
                            action: "scale_down",
                            status: "skipped",
                            reason: "Specific agent ID required for termination safety."
                        });
                    }
                }
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(results, null, 2)
                }]
            };
        }
    );
}
