import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";

export function registerEconomicOptimizationTools(server: McpServer) {
    // 4. Allocate Resources Optimally
    server.tool(
        "allocate_resources_optimally",
        "Predicts demand and recommends swarm allocation.",
        {
            client_forecasts: z.array(z.object({
                clientId: z.string(),
                projected_demand_score: z.number() // 0-100
            })).describe("List of clients and their projected demand.")
        },
        async ({ client_forecasts }) => {
            const allocation = client_forecasts.map(client => {
                let swarm_size = 1; // Base
                if (client.projected_demand_score > 80) swarm_size = 3;
                else if (client.projected_demand_score > 50) swarm_size = 2;

                return {
                    clientId: client.clientId,
                    recommended_swarm_size: swarm_size,
                    priority: client.projected_demand_score > 70 ? "High" : "Standard"
                };
            });

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(allocation, null, 2)
                }]
            };
        }
    );

    // 5. Generate Business Insights
    server.tool(
        "generate_business_insights",
        "Generates an executive summary of business health and strategy.",
        {
            metrics: z.string().describe("JSON string of performance metrics."),
            market_analysis: z.string().describe("Summary of market analysis."),
            pricing_recommendations: z.string().optional().describe("JSON string of pricing recommendations.")
        },
        async ({ metrics, market_analysis, pricing_recommendations }) => {
            const llm = createLLM();
            const prompt = `
                Generate an Executive Business Insight Report.

                Performance Metrics:
                ${metrics}

                Market Analysis:
                ${market_analysis}

                Pricing Recommendations:
                ${pricing_recommendations || "None"}

                Format: Markdown. Include: Executive Summary, Key Wins, Strategic Risks, and Actionable Next Steps.
            `;

            const response = await llm.generate(prompt, []);

            return {
                content: [{
                    type: "text",
                    text: response.message || "No insights generated."
                }]
            };
        }
    );
}
