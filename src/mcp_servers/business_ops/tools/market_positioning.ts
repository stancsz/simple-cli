import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm/index.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getMarketData, analyzeCompetitorPricingInternal } from "./market_analysis.js";
import { readStrategy } from "../../brain/tools/strategy.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";

export function registerMarketPositioningTools(server: McpServer) {
    server.tool(
        "analyze_competitive_landscape",
        "Continuously analyzes the competitive landscape combining market data and corporate strategy.",
        {
            competitor_urls: z.array(z.string()).describe("List of competitor URLs to analyze."),
            sector: z.string().describe("The business sector (e.g., 'Software Development')."),
            region: z.string().describe("The region (e.g., 'US', 'Global')."),
            company: z.string().optional().default("default").describe("Company ID for context.")
        },
        async ({ competitor_urls, sector, region, company }) => {
            const memory = new EpisodicMemory();
            await memory.init();
            const llm = createLLM();

            // 1. Gather Market Data
            const marketData = await getMarketData(sector, region);

            // 2. Gather Competitor Data
            const competitorData = await analyzeCompetitorPricingInternal(competitor_urls, false);

            // 3. Get Corporate Strategy
            const currentStrategy = await readStrategy(memory, company);
            const strategyContext = currentStrategy ? JSON.stringify(currentStrategy) : "No specific strategy found.";

            // 4. Synthesize with LLM
            const prompt = `Act as a Chief Marketing Officer. Analyze the competitive landscape to identify market positioning opportunities.

Market Data:
${JSON.stringify(marketData, null, 2)}

Competitor Data:
${JSON.stringify(competitorData, null, 2)}

Our Current Corporate Strategy:
${strategyContext}

Task: Compare our strategy against the competitors and market trends. Identify gaps, overlapping areas, and potential "Blue Ocean" opportunities.
Return a structured JSON report with the following format:
{
  "market_gaps": ["string"],
  "competitive_threats": ["string"],
  "recommended_focus_areas": ["string"],
  "blue_ocean_opportunities": ["string"],
  "overall_assessment": "string"
}`;

            const response = await llm.generate(prompt, []);
            const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
            const analysisReport = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to generate report", raw: response.message };

            // Store analysis in Memory
            await memory.store(
                `competitive_landscape_${Date.now()}`,
                `Competitive landscape analysis for ${sector} in ${region}`,
                JSON.stringify(analysisReport),
                ["market_positioning", "competitive_analysis"],
                company,
                undefined,
                false,
                undefined,
                undefined,
                0,
                0,
                "competitive_landscape"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(analysisReport, null, 2)
                }]
            };
        }
    );

    server.tool(
        "propose_positioning_adjustment",
        "Proposes strategic pivots and updates agency messaging based on competitive landscape analysis.",
        {
            current_positioning: z.string().describe("Current agency positioning or messaging."),
            landscape_report: z.string().optional().describe("Provide the report directly, otherwise the latest report will be fetched from memory."),
            company: z.string().optional().default("default").describe("Company ID for context.")
        },
        async ({ current_positioning, landscape_report, company }) => {
            const memory = new EpisodicMemory();
            await memory.init();
            const llm = createLLM();

            let report = landscape_report;
            if (!report) {
                const memories = await memory.recall("competitive landscape", 1, company, "competitive_landscape");
                if (memories.length > 0) {
                    report = memories[0].agentResponse;
                } else {
                    report = "No recent competitive landscape report found.";
                }
            }

            const currentStrategy = await readStrategy(memory, company);
            const strategyContext = currentStrategy ? JSON.stringify(currentStrategy) : "No specific strategy found.";

            const prompt = `Act as a Chief Strategy Officer and Chief Marketing Officer.

Current Agency Positioning:
${current_positioning}

Recent Competitive Landscape Report:
${report}

Our Current Corporate Strategy:
${strategyContext}

Task: Propose a strategic positioning adjustment to capture market opportunities. Update the agency messaging to align with this pivot.
Return a valid JSON object matching this structure:
{
  "strategic_pivot_rationale": "string",
  "updated_value_proposition": "string",
  "target_audience_shift": "string",
  "recommended_policy_updates": {
    "min_margin": number (optional),
    "risk_tolerance": "low" | "medium" | "high" (optional)
  },
  "new_messaging_pillars": ["string"]
}`;

            const response = await llm.generate(prompt, []);
            const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
            const proposal = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to generate proposal", raw: response.message };

            // Store positioning update in Memory
            await memory.store(
                `positioning_adjustment_${Date.now()}`,
                `Positioning adjustment based on landscape`,
                JSON.stringify(proposal),
                ["market_positioning", "strategy_pivot"],
                company,
                undefined,
                false,
                undefined,
                undefined,
                0,
                0,
                "positioning_adjustment"
            );

            // If there are recommended policy updates, we automatically route them to the Policy Engine memory
            if (proposal.recommended_policy_updates) {
                 // Get latest policy
                 let newPolicyDesc = "Policy update driven by market positioning adjustment.";
                 let min_margin = proposal.recommended_policy_updates.min_margin;
                 let risk_tolerance = proposal.recommended_policy_updates.risk_tolerance;

                 // We will directly inject the policy update into episodic memory so `get_active_policy` picks it up.
                 // Fetch existing policy to increment version.
                 const policyMemories = await memory.recall("corporate_policy", 1, company, "corporate_policy");

                 let newVersion = 1;
                 let previousId = undefined;
                 let currentMinMargin = 0.2;
                 let currentRisk = "medium";
                 let max_agents = 5;

                 if (policyMemories.length > 0) {
                     try {
                         const currentPolicy = JSON.parse(policyMemories[0].agentResponse) as CorporatePolicy;
                         newVersion = currentPolicy.version + 1;
                         previousId = currentPolicy.id;
                         currentMinMargin = currentPolicy.parameters?.min_margin || 0.2;
                         currentRisk = currentPolicy.parameters?.risk_tolerance || "medium";
                         max_agents = currentPolicy.parameters?.max_agents_per_swarm || 5;
                     } catch (e) {
                         // Ignore
                     }
                 }

                 const newPolicy: CorporatePolicy = {
                     id: randomUUID(),
                     version: newVersion,
                     name: "Global Operating Policy - Market Adjusted",
                     description: newPolicyDesc,
                     parameters: {
                         min_margin: min_margin !== undefined ? min_margin : currentMinMargin,
                         risk_tolerance: risk_tolerance !== undefined ? risk_tolerance : currentRisk,
                         max_agents_per_swarm: max_agents
                     },
                     isActive: true,
                     timestamp: Date.now(),
                     author: "Market Positioning Automation",
                     previous_version_id: previousId
                 };

                 await memory.store(
                     `policy_update_v${newVersion}`,
                     `Update operating policy to version ${newVersion}: ${newPolicyDesc}`,
                     JSON.stringify(newPolicy),
                     [],
                     company,
                     undefined,
                     undefined,
                     undefined,
                     newPolicy.id,
                     0,
                     0,
                     "corporate_policy"
                 );
                 proposal.policy_routing_status = "Policy updated successfully based on recommendations.";
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(proposal, null, 2)
                }]
            };
        }
    );
}
