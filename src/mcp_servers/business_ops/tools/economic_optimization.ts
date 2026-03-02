import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";

export function registerEconomicOptimizationTools(server: McpServer) {
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
