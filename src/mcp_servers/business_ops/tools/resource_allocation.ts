import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP } from "../../../mcp.js";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getFleetStatusLogic } from "./swarm_fleet_management.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { scaleSwarmLogic } from "../../scaling_engine/scaling_orchestrator.js";

export function registerResourceAllocationTools(server: McpServer, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "allocate_resources_optimally",
        "Analyzes demand, financials, and health to produce a resource allocation plan.",
        {
            dry_run: z.boolean().default(true).describe("If true, only returns the plan without executing scaling actions.")
        },
        async ({ dry_run }) => {
            const logs: string[] = [];
            const planDetails: any[] = [];

            try {
                // 1. Gather Data
                logs.push("Fetching fleet status...");
                const fleetStatus = await getFleetStatusLogic();

                logs.push("Fetching system health...");
                let systemHealth = "Unknown";
                try {
                    // Check if health_monitor is available
                    // We'll try to use the mcp client to call it if it's running as a separate server
                    // Or if we are in the same process, we might not reach it easily without a proper client setup.
                    // Assuming 'health_monitor' server is registered in MCP.
                    await mcp.init();
                    const healthRes = await mcp.getClient("health_monitor")?.callTool({
                        name: "get_system_health_summary",
                        arguments: {}
                    });
                    // @ts-ignore
                    if (healthRes && healthRes.content && healthRes.content[0] && healthRes.content[0].text) {
                        // @ts-ignore
                        systemHealth = healthRes.content[0].text;
                    }
                } catch (e) {
                    logs.push(`Warning: Failed to fetch system health: ${(e as Error).message}`);
                }

                logs.push("Fetching financial metrics...");
                const financials = await collectPerformanceMetrics("last_30_days");

                logs.push("Analyzing Brain activity...");
                const brainInsights: Record<string, string> = {};
                const memory = new EpisodicMemory();
                await memory.init();

                for (const client of fleetStatus) {
                    try {
                        const memories = await memory.recall(`urgent issues ${client.company}`, 3);
                        const sentiment = memories.length > 0 ? "Active Context" : "Quiet";
                        brainInsights[client.company] = sentiment;
                    } catch (e) {
                        brainInsights[client.company] = "Error accessing memory";
                    }
                }

                // 2. Generate Plan with LLM
                const llm = createLLM();
                const prompt = `
                    You are the Resource Allocation Engine for an autonomous agency.
                    Analyze the following data and recommend swarm scaling actions.

                    Fleet Status:
                    ${JSON.stringify(fleetStatus, null, 2)}

                    System Health:
                    ${systemHealth}

                    Financial Performance (Last 30 Days):
                    ${JSON.stringify(financials, null, 2)}

                    Brain Activity Context:
                    ${JSON.stringify(brainInsights, null, 2)}

                    Constraints:
                    - High revenue clients with high demand (pending issues) should get priority.
                    - If system health is poor (e.g. alerts), be conservative with scaling up.
                    - 'maintain' if balanced. 'scale_up' if strained/high demand. 'scale_down' if idle.

                    Output JSON format ONLY:
                    [
                        {
                            "company": "Client Name",
                            "action": "scale_up" | "scale_down" | "maintain",
                            "reason": "Explanation",
                            "role": "specialist" (optional, for scale_up),
                            "task": "Specific task" (optional, for scale_up)
                        }
                    ]
                `;

                const response = await llm.generate(prompt, []);
                let allocationPlan: any[] = [];

                try {
                     // Attempt to parse JSON from response
                     const jsonMatch = response.message?.match(/\[.*\]/s);
                     if (jsonMatch) {
                         allocationPlan = JSON.parse(jsonMatch[0]);
                     } else {
                         // Fallback or simple parse
                         allocationPlan = JSON.parse(response.message || "[]");
                     }
                } catch (e) {
                    logs.push("Failed to parse LLM allocation plan. Defaulting to empty plan.");
                }

                // 3. Execute Plan (if not dry_run)
                let executionResults: any[] | undefined = undefined;

                if (!dry_run) {
                    executionResults = [];
                    for (const item of allocationPlan) {
                        if (item.action === "maintain") continue;

                        logs.push(`Executing ${item.action} for ${item.company}...`);
                        try {
                            if (item.action === "scale_up") {
                                const result = await scaleSwarmLogic(
                                    mcp,
                                    item.company,
                                    "spawn",
                                    item.role || "specialist",
                                    item.task || "Address backlog"
                                );
                                executionResults.push({ company: item.company, status: "success", result });
                            } else if (item.action === "scale_down") {
                                // Scale down requires agent_id, which we might not have from this high-level view
                                // We'll log it as a recommendation or try if we implemented a "kill random" logic
                                executionResults.push({ company: item.company, status: "skipped", reason: "Scale down requires specific agent ID target." });
                            }
                        } catch (e) {
                            executionResults.push({ company: item.company, status: "failed", error: (e as Error).message });
                        }
                    }
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
                            mode: dry_run ? "dry_run" : "execution",
                            plan: allocationPlan,
                            execution_results: executionResults,
                            logs
                        }, null, 2)
                    }]
                };

            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error in resource allocation: ${(error as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
