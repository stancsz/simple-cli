import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { generatePricingRecommendations } from "./pricing_optimization.js";
import { getMarketData } from "./market_analysis.js";

interface ServiceBundleRecommendation {
    name: string;
    target_client_segment: string;
    estimated_price_range: string;
    margin_projection: string;
    required_skills: string[];
    value_proposition: string;
    implementation_complexity: "Low" | "Medium" | "High";
}

export function registerServiceAdjustmentTools(server: McpServer) {
    server.tool(
        "adjust_service_offerings",
        "Analyzes internal performance, pricing context, and market trends to recommend new, profitable service bundles.",
        {
            current_services: z.array(z.object({
                name: z.string(),
                current_price: z.number(),
                cost: z.number().optional()
            })).describe("List of current services to use as a baseline."),
            market_focus: z.string().optional().describe("Optional focus area for market analysis (e.g., 'AI Automation', 'Fintech').")
        },
        async ({ current_services, market_focus }) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Idempotency Check (Last 24 Hours)
            const recentRuns = await memory.recall(
                "service_adjustment_run",
                1,
                undefined,
                "service_recommendation"
            );

            if (recentRuns.length > 0) {
                const lastRun = recentRuns[0];
                const lastRunTime = new Date(lastRun.timestamp).getTime();
                const now = new Date().getTime();
                if ((now - lastRunTime) < 24 * 60 * 60 * 1000) {
                     return {
                        content: [{
                            type: "text",
                            text: `Service adjustment analysis already run recently. Last recommendation: ${lastRun.agentResponse}`
                        }]
                    };
                }
            }

            // 2. Aggregate Data
            const performanceMetrics = await collectPerformanceMetrics("last_30_days");
            const pricingContext = await generatePricingRecommendations(current_services);
            const marketData = getMarketData(market_focus || "Software Development", "US");

            // 3. LLM Synthesis
            const llm = createLLM();
            const systemPrompt = `You are a Chief Strategy Officer. Synthesize the following data to recommend 3-5 new, high-margin service bundles.

            Internal Performance:
            ${JSON.stringify(performanceMetrics, null, 2)}

            Pricing Analysis:
            ${JSON.stringify(pricingContext, null, 2)}

            Market Intelligence:
            ${JSON.stringify(marketData, null, 2)}

            Current Offerings:
            ${JSON.stringify(current_services, null, 2)}

            Task: Identify gaps in the market and internal capabilities to propose new service bundles.
            Constraint: Return a strict JSON array of objects with the following schema:
            [
              {
                "name": "string",
                "target_client_segment": "string",
                "estimated_price_range": "string (e.g. $5k-$10k)",
                "margin_projection": "string (e.g. 40%)",
                "required_skills": ["string"],
                "value_proposition": "string",
                "implementation_complexity": "Low/Medium/High"
              }
            ]`;

            let recommendations: ServiceBundleRecommendation[] = [];
            try {
                const response = await llm.generate(systemPrompt, []);
                const message = response.message || "";
                const jsonMatch = message.match(/\[\s*\{.*\}\s*\]/s);

                if (jsonMatch) {
                    recommendations = JSON.parse(jsonMatch[0]);
                } else {
                     recommendations = JSON.parse(message);
                }
            } catch (e) {
                console.error("LLM Service Adjustment Failed:", e);
                // Fallback recommendations if LLM fails
                recommendations = [
                    {
                        name: "AI-Enhanced Audit",
                        target_client_segment: "SMEs",
                        estimated_price_range: "$2500-$5000",
                        margin_projection: "60%",
                        required_skills: ["Analysis", "AI Tools"],
                        value_proposition: "Quick, low-cost audit of current processes using AI to identify efficiency gains.",
                        implementation_complexity: "Low"
                    }
                ];
            }

            // 4. Store in Brain
            await memory.store(
                `service_adjustment_${new Date().toISOString()}`,
                "Service Bundle Recommendations",
                JSON.stringify(recommendations),
                ["service_adjustment", "strategic_planning"],
                undefined, undefined, false, undefined, undefined, 0, 0,
                "service_recommendation"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(recommendations, null, 2)
                }]
            };
        }
    );
}
