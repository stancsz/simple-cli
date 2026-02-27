import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";

export function registerEconomicOptimizationTools(server: McpServer) {
    // 3. Adjust Service Offerings
    server.tool(
        "adjust_service_offerings",
        "Recommends service bundle adjustments based on profitability and demand.",
        {
            performance_metrics: z.string().describe("JSON string of performance metrics.")
        },
        async ({ performance_metrics }) => {
            const metrics = JSON.parse(performance_metrics);
            const recommendations = [];

            if (metrics.financial.margin < 0.2) {
                recommendations.push({
                    action: "Bundle Services",
                    proposal: "Combine 'Basic Support' with 'Consultation' to increase perceived value and margin.",
                    expected_impact: "Increase margin by 5%"
                });
            }

            if (metrics.client.churnRate > 0.05) {
                recommendations.push({
                    action: "Introduce Retention Tier",
                    proposal: "Create a 'Loyalty Maintenance' plan with a 10% discount for annual commitment.",
                    expected_impact: "Reduce churn by 2%"
                });
            }

            if (metrics.delivery.efficiency > 0.9) {
                recommendations.push({
                    action: "Expand Premium Offerings",
                    proposal: "Launch 'Expedited Delivery' service at a 50% premium.",
                    expected_impact: "Increase revenue by 10%"
                });
            }

            if (recommendations.length === 0) {
                 recommendations.push({
                    action: "Monitor",
                    proposal: "Current offerings are performing well. Continue monitoring.",
                    expected_impact: "Maintain stability"
                });
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(recommendations, null, 2)
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
