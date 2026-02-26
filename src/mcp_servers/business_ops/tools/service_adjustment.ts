import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { getMarketData } from "./market_analysis.js";

interface ServiceRecommendation {
    action: "create" | "modify" | "retire";
    service_name: string;
    target_segment: string;
    suggested_price: number;
    estimated_impact: string;
    reasoning: string;
}

export function registerServiceAdjustmentTools(server: McpServer) {
    server.tool(
        "adjust_service_offerings",
        "Analyzes internal performance and market data to recommend service bundle adjustments.",
        {
            current_offerings: z.array(z.object({
                name: z.string(),
                current_price: z.number(),
                description: z.string().optional()
            })).describe("List of current service offerings."),
            analysis_period: z.enum(["last_30_days", "last_quarter", "year_to_date"]).default("last_quarter").describe("Period for performance analysis.")
        },
        async ({ current_offerings, analysis_period }) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Fetch Internal Performance Data
            const internalMetrics = await collectPerformanceMetrics(analysis_period);

            // 2. Fetch External Market Data (Default context)
            const marketData = getMarketData("Software Development", "US");

            // 3. LLM Analysis
            const llm = createLLM();
            const systemPrompt = `You are a Chief Strategy Officer. Analyze the agency's service offerings against internal performance and market trends.

            Internal Performance Metrics (${analysis_period}):
            ${JSON.stringify(internalMetrics, null, 2)}

            Current Service Offerings:
            ${JSON.stringify(current_offerings, null, 2)}

            Market Intelligence:
            ${JSON.stringify(marketData, null, 2)}

            Task: Recommend strategic adjustments to service bundles (create new, modify existing, or retire).
            Focus on maximizing profitability and aligning with market demand (e.g., AI, automation).

            Constraint: Return a strict JSON array of objects with the following schema:
            {
                "action": "create" | "modify" | "retire",
                "service_name": string,
                "target_segment": string,
                "suggested_price": number,
                "estimated_impact": string,
                "reasoning": string
            }`;

            let recommendations: ServiceRecommendation[] = [];
            try {
                const response = await llm.generate(systemPrompt, []);
                const message = response.message || "";

                // Parse JSON from response (handling potential markdown code blocks)
                const jsonMatch = message.match(/\[\s*\{.*\}\s*\]/s);
                if (jsonMatch) {
                    recommendations = JSON.parse(jsonMatch[0]);
                } else {
                    recommendations = JSON.parse(message);
                }
            } catch (e) {
                console.error("LLM Analysis Failed:", e);
                // Fallback recommendations if LLM fails
                recommendations = [{
                    action: "modify",
                    service_name: current_offerings[0]?.name || "General Service",
                    target_segment: "Existing Clients",
                    suggested_price: (current_offerings[0]?.current_price || 100) * 1.1,
                    estimated_impact: "Moderate revenue increase",
                    reasoning: "Fallback: Standard inflationary adjustment due to analysis failure."
                }];
            }

            // 4. Store Analysis in Brain
            try {
                await memory.store(
                    `service_adjustment_${new Date().toISOString()}`,
                    "Service Offering Recommendations",
                    JSON.stringify(recommendations),
                    ["service_optimization", "strategy"],
                    undefined, undefined, false, undefined, undefined, 0, 0,
                    "service_adjustment"
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
