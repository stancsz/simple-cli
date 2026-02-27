import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP } from "../../../mcp.js";
import { createLLM } from "../../../llm.js";
import { getFleetStatusLogic } from "./swarm_fleet_management.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { scaleSwarmLogic } from "../../scaling_engine/scaling_orchestrator.js";

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

            // 2. Analyze each client context
            for (const status of fleetStatus) {
                // Collect detailed metrics
                let metrics;
                try {
                    metrics = await collectPerformanceMetrics("last_30_days", status.company);
                } catch (e) {
                    console.warn(`Failed to collect metrics for ${status.company}`, e);
                    // Continue with partial data
                }

                // Construct Analysis Prompt
                const context = {
                    client: status.company,
                    fleet_status: status,
                    performance_metrics: metrics,
                    market_context: "Assuming standard market growth and seasonal stability." // Placeholder or fetch from market tool
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
