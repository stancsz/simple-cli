import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { collectPerformanceMetrics } from "./performance_analytics.js";
import { collectMarketData } from "./market_analysis.js";

interface ServiceRecommendation {
    name: string;
    description: string;
    target_client: string;
    projected_margin: number;
    implementation_steps: string[];
}

interface ServiceAdjustmentOutput {
    recommendations: ServiceRecommendation[];
    summary: string;
}

export function registerServiceAdjustmentTools(server: McpServer) {
    server.tool(
        "adjust_service_offerings",
        "Recommends profitable service bundles based on performance metrics and market analysis.",
        {
            timeframe: z.enum(["last_30_days", "last_quarter", "year_to_date"]).default("last_quarter").describe("Time period for analysis."),
            target_margin: z.number().default(0.4).describe("Target profit margin for new service bundles (e.g., 0.4 for 40%).")
        },
        async ({ timeframe, target_margin }) => {
            // 1. Fetch Internal Performance Data
            let performanceMetrics;
            try {
                performanceMetrics = await collectPerformanceMetrics(timeframe);
            } catch (e) {
                console.error("Failed to collect performance metrics:", e);
                throw new Error("Failed to collect performance metrics for service adjustment.");
            }

            // 2. Fetch External Market Data
            // using sensible defaults for the agency context as per plan
            let marketData;
            try {
                marketData = await collectMarketData("Software Development", "Global", "Service trends and high-margin opportunities");
            } catch (e) {
                console.error("Failed to collect market data:", e);
                 // Fallback to basic data if external fetch fails
                 marketData = {
                     sector: "Software Development",
                     trends: ["AI Integration", "Security Audits", "Cloud Optimization"]
                 };
            }

            // 3. Generate Recommendations via LLM
            const llm = createLLM();
            const prompt = `You are a Chief Strategy Officer. Analyze our agency's performance and current market trends to recommend 3-5 profitable service bundles.

            Internal Performance (${timeframe}):
            ${JSON.stringify(performanceMetrics, null, 2)}

            Market Intelligence:
            ${JSON.stringify(marketData, null, 2)}

            Goal: Suggest new or adjusted service offerings that achieve a target margin of ${(target_margin * 100).toFixed(0)}%.

            Return a strict JSON object matching this structure:
            {
              "recommendations": [
                {
                  "name": "string",
                  "description": "string",
                  "target_client": "string",
                  "projected_margin": number (0.0-1.0),
                  "implementation_steps": ["string"]
                }
              ],
              "summary": "string"
            }`;

            let output: ServiceAdjustmentOutput;
            try {
                const response = await llm.generate(prompt, []);
                const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
                const rawJson = jsonMatch ? jsonMatch[0] : response.message || "{}";
                output = JSON.parse(rawJson);

                // Basic validation
                if (!output.recommendations || !Array.isArray(output.recommendations)) {
                    throw new Error("Invalid output format from LLM");
                }
            } catch (e) {
                console.error("LLM Generation Failed:", e);
                // Fallback response
                output = {
                    recommendations: [
                        {
                            name: "Performance Audit Bundle",
                            description: "Comprehensive audit of application performance and security.",
                            target_client: "Enterprise",
                            projected_margin: 0.5,
                            implementation_steps: ["Define audit scope", "Automate scanning", "Create report template"]
                        }
                    ],
                    summary: "LLM analysis failed; returning fallback recommendation."
                };
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(output, null, 2)
                }]
            };
        }
    );
}
