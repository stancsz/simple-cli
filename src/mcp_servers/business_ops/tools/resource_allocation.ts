import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { getLinearClient } from "../linear_service.js";
import { createLLM } from "../../../llm.js";

interface AllocationRecommendation {
    clientId: string;
    clientName: string;
    currentSwarmSize: number;
    recommendedSwarmSize: number;
    action: "scale_up" | "scale_down" | "maintain";
    justification: string;
}

export function registerResourceAllocationTools(server: McpServer) {
    server.tool(
        "allocate_resources_optimally",
        "Predicts demand and recommends optimal swarm allocation across the fleet.",
        {},
        async () => {
            try {
                // 1. Fetch Active Projects (Clients)
                const linear = getLinearClient();
                const projects = await linear.projects();
                const activeProjects = [];

                for (const project of projects.nodes) {
                    const state = await project.state;
                    if (state && (state as any).type !== "completed" && (state as any).type !== "canceled") {
                        activeProjects.push(project);
                    }
                }

                if (activeProjects.length === 0) {
                     return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ message: "No active clients found to allocate resources for." })
                        }]
                    };
                }

                // 2. Aggregate Data for Each Client
                const clientData = [];
                for (const project of activeProjects) {
                    // Collect Performance Metrics (Revenue, Efficiency, Client Health)
                    // We attempt to filter by client ID (Project ID), assuming the underlying tool supports it or we use it as context.
                    // For now, we fetch the metrics. In a real scenario, this would return specific data for the client if supported.
                    const metrics = await collectPerformanceMetrics("last_30_days", project.id);

                    const issues = await project.issues({
                        filter: { state: { type: { neq: "completed" } } }
                    });
                    const backlogSize = issues.nodes.length;

                    // Simulated "current swarm size" - in reality, we'd query the swarm orchestrator
                    const currentSwarmSize = 1;

                    // Simulated Brain Context (Historical Demand)
                    // In a real implementation, we would query the Brain for "historical_demand_{clientId}"
                    const historicalDemandTrend = backlogSize > 5 ? "increasing" : "stable";

                    clientData.push({
                        clientId: project.id,
                        name: project.name,
                        backlog: backlogSize,
                        currentSwarmSize,
                        financials: {
                            revenue: metrics.financial.revenue, // This might be global if not filtered, but provides context
                            margin: metrics.financial.margin
                        },
                        clientHealth: {
                            sentiment: metrics.client.satisfactionScore,
                            churnRisk: metrics.client.churnRate
                        },
                        historicalTrend: historicalDemandTrend
                    });
                }

                // 3. LLM Reasoning
                const llm = createLLM();
                const prompt = `
                    You are an expert Resource Manager for an autonomous AI agency.
                    Analyze the following client data and recommend optimal swarm allocations.

                    Data:
                    ${JSON.stringify(clientData, null, 2)}

                    Guidelines:
                    - **High Demand**: Backlog > 10 OR Historical Trend is 'increasing' -> Consider Scale Up.
                    - **Low Demand**: Backlog == 0 AND Historical Trend is 'stable' -> Consider Scale Down (min 1 agent).
                    - **High Value**: If Revenue/Margin is high, prioritize stability and rapid scaling if needed.
                    - **Risk**: If Churn Risk is high (> 0.1), prioritize maintaining or increasing service levels to save the account.
                    - Otherwise -> Maintain.

                    Output JSON format:
                    [
                        {
                            "clientId": "string",
                            "clientName": "string",
                            "currentSwarmSize": number,
                            "recommendedSwarmSize": number,
                            "action": "scale_up" | "scale_down" | "maintain",
                            "justification": "string (explain why based on backlog, financials, or risk)"
                        }
                    ]
                    RETURN ONLY JSON. NO MARKDOWN.
                `;

                const response = await llm.generate(prompt, []);

                // Parse LLM Output
                let recommendations: AllocationRecommendation[] = [];
                try {
                    const cleanJson = response.message?.replace(/```json/g, '').replace(/```/g, '').trim() || "[]";
                    recommendations = JSON.parse(cleanJson);
                } catch (e) {
                    console.error("Failed to parse LLM allocation response:", e);
                    // Fallback Logic
                    recommendations = clientData.map(c => ({
                        clientId: c.clientId,
                        clientName: c.name,
                        currentSwarmSize: c.currentSwarmSize,
                        recommendedSwarmSize: c.backlog > 10 ? c.currentSwarmSize + 1 : c.currentSwarmSize,
                        action: c.backlog > 10 ? "scale_up" : "maintain",
                        justification: "Fallback: Logic based on backlog size."
                    }));
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(recommendations, null, 2)
                    }]
                };

            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error allocating resources: ${(error as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
