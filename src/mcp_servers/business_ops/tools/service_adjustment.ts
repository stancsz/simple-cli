import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { getMarketData } from "./market_analysis.js";

interface ServiceRecommendation {
    bundle_name: string;
    description: string;
    target_client_profile: string;
    recommended_price: number;
    price_justification: string;
    expected_margin: number;
    confidence_score: number;
}

export function registerServiceAdjustmentTools(server: McpServer) {
    server.tool(
        "adjust_service_offerings",
        "Recommends new or adjusted service bundles based on internal performance and market trends.",
        {
            analysis_period: z.enum(["last_30_days", "last_quarter", "year_to_date"]).default("last_quarter").describe("Time period for analysis.")
        },
        async ({ analysis_period }) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Gather Internal Data
            const metrics = await collectPerformanceMetrics(analysis_period);

            // 2. Gather External Data
            // Context: Assuming Software Development sector in US as default
            const marketData = await getMarketData("Software Development", "US");

            // 3. Query Brain for Success Patterns
            let successfulPatterns = [];
            try {
                const episodes = await memory.recall("successful project", 5);
                successfulPatterns = episodes.map(e => e.content);
            } catch (e) {
                console.warn("Failed to recall success patterns:", e);
            }

            // 4. LLM Analysis
            const llm = createLLM();
            const systemPrompt = `You are a Chief Strategy Officer. Analyze the agency's performance and market data to recommend profitable service adjustments.

            Internal Metrics (${analysis_period}):
            ${JSON.stringify(metrics, null, 2)}

            Market Data:
            ${JSON.stringify(marketData, null, 2)}

            Successful Project Patterns:
            ${JSON.stringify(successfulPatterns)}

            Task: Recommend 2-3 new or adjusted service bundles.
            - Focus on high-margin opportunities.
            - Combine underutilized high-efficiency services with high-demand areas.
            - Define target client profiles.

            Output Format:
            Return a JSON array of objects with this structure:
            [
              {
                "bundle_name": "string",
                "description": "string",
                "target_client_profile": "string",
                "recommended_price": number,
                "price_justification": "string",
                "expected_margin": number (0-1),
                "confidence_score": number (0-1)
              }
            ]`;

            let recommendations: ServiceRecommendation[] = [];
            try {
                const response = await llm.generate(systemPrompt, []);
                const message = response.message || "";

                // Extract JSON from response
                const jsonMatch = message.match(/\[\s*\{.*\}\s*\]/s) || message.match(/\{.*\}/s);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    recommendations = Array.isArray(parsed) ? parsed : [parsed];
                } else {
                    // Fallback if no JSON found
                    throw new Error("No JSON found in LLM response");
                }
            } catch (e) {
                console.error("LLM Service Adjustment Analysis Failed:", e);
                // Fallback recommendations
                recommendations = [
                    {
                        bundle_name: "Efficiency Audit & Optimization",
                        description: "Leverage high delivery efficiency to offer quick-turnaround audits.",
                        target_client_profile: "Mid-sized tech companies",
                        recommended_price: 5000,
                        price_justification: "Based on high velocity metrics and market demand for optimization.",
                        expected_margin: 0.6,
                        confidence_score: 0.5
                    }
                ];
            }

            // 5. Store Recommendations in Brain
            try {
                await memory.store(
                    `service_adjustment_${analysis_period}_${Date.now()}`,
                    "Service Adjustment Recommendations",
                    JSON.stringify(recommendations),
                    ["economic_optimization", "service_strategy"],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "service_recommendation"
                );
            } catch (e) {
                console.warn("Brain storage failed:", e);
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(recommendations, null, 2)
                }]
            };
        }
    );
}
