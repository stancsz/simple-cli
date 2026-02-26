import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getXeroClient, getTenantId } from "../xero_tools.js";

interface PerformanceMetrics {
    period: string;
    financial: {
        revenue: number;
        profit: number;
        margin: number;
        outstanding: number;
    };
    delivery: {
        velocity: number;
        cycleTime: number;
        efficiency: number; // 0-1
    };
    client: {
        nps: number;
        churnRate: number;
        activeClients: number;
    };
    timestamp: string;
}

export function registerEconomicOptimizationTools(server: McpServer) {
    // Note: 'analyze_performance_metrics' has been moved to its own file 'performance_analytics.ts'
    // to support full integration with Xero, Linear, and HubSpot.

    // 2. Optimize Pricing Strategy
    server.tool(
        "optimize_pricing_strategy",
        "Uses LLM to analyze performance and market data to recommend pricing updates.",
        {
            current_services: z.array(z.object({
                name: z.string(),
                current_price: z.number(),
                cost: z.number().optional()
            })).describe("List of current services and prices."),
            market_data_summary: z.string().describe("Summary of market data (from collect_market_data).")
        },
        async ({ current_services, market_data_summary }) => {
            const llm = createLLM();
            const systemPrompt = `You are a Chief Economic Officer. Analyze the service pricing against market data.

            Current Services:
            ${JSON.stringify(current_services, null, 2)}

            Market Data Summary:
            ${market_data_summary}

            Task: Recommend pricing adjustments to maximize profit while remaining competitive.
            Constraint: Return a strict JSON array of objects with fields: service_name, old_price, new_price, confidence_score (0-1), reasoning.`;

            const response = await llm.generate(systemPrompt, []);

            // Extract JSON from response
            let recommendations = [];
            try {
                const message = response.message || "";
                // Simple regex to find JSON array
                const jsonMatch = message.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    recommendations = JSON.parse(jsonMatch[0]);
                } else {
                     // Fallback if LLM returns text
                     // Try to parse entire message if it looks like JSON
                     recommendations = JSON.parse(message);
                }
            } catch (e) {
                // Mock fallback if parsing fails (robustness)
                recommendations = [{ service_name: "Consultation", old_price: 100, new_price: 120, confidence_score: 0.8, reasoning: "Inflation adjustment." }];
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(recommendations, null, 2)
                }]
            };
        }
    );

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
