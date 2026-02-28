import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { readStrategy, proposeStrategicPivot } from "../../brain/tools/strategy.js";
import { getMarketData, analyzeCompetitorPricingInternal } from "./market_analysis.js";
import { CorporateStrategy } from "../../../brain/schemas.js";

export function registerMarketPositioningTools(server: McpServer) {
    server.tool(
        "analyze_and_adjust_positioning",
        "Continuously analyzes the competitive landscape against corporate strategy and recommends or applies service positioning adjustments.",
        {
            company: z.string().optional().describe("The company/client identifier for namespacing."),
            competitor_urls: z.array(z.string()).optional().describe("Optional list of competitor URLs to explicitly analyze."),
            auto_pivot: z.boolean().optional().default(false).describe("If true, automatically proposes a strategic pivot if confidence is high.")
        },
        async ({ company, competitor_urls, auto_pivot }) => {
            const episodic = new EpisodicMemory();
            await episodic.init();
            const llm = createLLM();

            // 1. Fetch the current Corporate Strategy
            const strategy: CorporateStrategy | null = await readStrategy(episodic, company);
            if (!strategy) {
                return {
                    content: [{ type: "text", text: "No corporate strategy found. Cannot perform positioning analysis." }],
                    isError: true
                };
            }

            // 2. Collect market data
            // We use target markets from the strategy, or default to a generic market
            const marketDataResults = [];
            const targetMarkets = strategy.objectives && strategy.objectives.length > 0
                ? strategy.objectives.filter(obj => obj.toLowerCase().includes("market") || obj.toLowerCase().includes("sector"))
                : ["Software Development"];

            // To ensure we get some data, if no specific market string is parsed nicely, use a default
            const marketsToAnalyze = targetMarkets.length > 0 ? targetMarkets : ["Software Development"];

            for (const market of marketsToAnalyze.slice(0, 2)) { // Limit to 2 for performance
                // Rough heuristic to split market string into sector/region
                const sector = market.includes(" ") ? market.split(" ")[0] : market;
                const data = await getMarketData(sector, "Global");
                marketDataResults.push(data);
            }

            // 3. Analyze Competitor Pricing
            const urlsToAnalyze = competitor_urls || [];
            let competitorAnalysis: any[] = [];
            if (urlsToAnalyze.length > 0) {
                competitorAnalysis = await analyzeCompetitorPricingInternal(urlsToAnalyze, false);
            }

            // 4. LLM Analysis
            const prompt = `Act as the Chief Marketing Officer and Chief Strategy Officer of an autonomous AI agency.

You need to analyze the competitive landscape and our current corporate strategy, then identify gaps, opportunities, and threats, and recommend positioning adjustments (e.g., niche focus, pricing tiers, unique value propositions).

=== Current Corporate Strategy ===
${JSON.stringify(strategy, null, 2)}

=== Market Data ===
${JSON.stringify(marketDataResults, null, 2)}

=== Competitor Data ===
${JSON.stringify(competitorAnalysis, null, 2)}

TASK:
1. Analyze the competitive landscape against the agency's current capabilities and strategy.
2. Identify gaps, opportunities, and threats.
3. Generate specific, actionable recommendations for positioning adjustments.
4. Provide a confidence score (0-1) for these recommendations.

Return a strictly valid JSON object matching this structure:
{
  "analysis": {
    "gaps": ["string"],
    "opportunities": ["string"],
    "threats": ["string"]
  },
  "recommendations": [
    {
      "type": "string (e.g., messaging_pivot, new_tier, value_proposition_update)",
      "description": "string",
      "actionable_steps": ["string"]
    }
  ],
  "confidence_score": number,
  "proposed_pivot_statement": "string (A concise strategic pivot proposal if confidence is high, else empty)"
}`;

            let report: any;
            try {
                const response = await llm.generate(prompt, []);
                let jsonStr = response.message || response.thought || "{}";

                // Extract JSON object safely
                const firstBrace = jsonStr.indexOf("{");
                const lastBrace = jsonStr.lastIndexOf("}");
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                }

                report = JSON.parse(jsonStr);
            } catch (error) {
                console.error("Failed to generate market positioning analysis:", error);
                return {
                    content: [{ type: "text", text: "Failed to generate market positioning analysis due to LLM error." }],
                    isError: true
                };
            }

            // Store the analysis report in Episodic Memory
            await episodic.store(
                `market_positioning_${Date.now()}`,
                `Positioning Analysis against Strategy`,
                JSON.stringify(report),
                ["market_positioning", "strategy", "phase_26"],
                company,
                undefined, undefined, undefined, undefined, undefined, undefined,
                "market_positioning_report"
            );

            let pivotResultStr = "";

            // 5. Optionally auto-pivot if confidence is high
            if (auto_pivot && report.confidence_score >= 0.8 && report.proposed_pivot_statement) {
                try {
                    const newStrategy = await proposeStrategicPivot(
                        episodic,
                        llm,
                        report.proposed_pivot_statement,
                        company
                    );
                    pivotResultStr = `\n\n[Auto-Pivot Executed]\nSuccessfully updated Corporate Strategy:\n${JSON.stringify(newStrategy, null, 2)}`;
                } catch (pivotError: any) {
                    pivotResultStr = `\n\n[Auto-Pivot Failed]\nAttempted to update strategy but failed: ${pivotError.message}`;
                }
            } else if (auto_pivot && report.confidence_score < 0.8) {
                pivotResultStr = `\n\n[Auto-Pivot Skipped]\nConfidence score (${report.confidence_score}) was below the 0.8 threshold.`;
            }

            return {
                content: [{
                    type: "text",
                    text: `Market Positioning Analysis Report:\n\n${JSON.stringify(report, null, 2)}${pivotResultStr}`
                }]
            };
        }
    );
}
