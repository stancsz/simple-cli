import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy, CorporateStrategy } from "../../../brain/schemas.js";
import { getMarketData, analyzeCompetitorPricingInternal } from "./market_analysis.js";
import { updateOperatingPolicyLogic } from "./policy_engine.js";
import { dirname } from "path";

export function registerMarketPositioningTools(server: McpServer) {
    server.tool(
        "analyze_competitive_landscape",
        "Regularly fetches and analyzes competitor data, industry trends, and the agency's own performance metrics to identify positioning gaps or opportunities.",
        {
            sector: z.string().describe("The business sector (e.g., 'Software Development')."),
            region: z.string().describe("The region (e.g., 'US', 'Global')."),
            competitor_urls: z.array(z.string()).describe("List of competitor URLs to analyze."),
            force_refresh: z.boolean().optional().default(false).describe("If true, ignores cache and re-scrapes competitor data.")
        },
        async ({ sector, region, competitor_urls, force_refresh }) => {
            const llm = createLLM();

            // Collect market data and competitor pricing
            const marketData = await getMarketData(sector, region);
            const competitorData = await analyzeCompetitorPricingInternal(competitor_urls, force_refresh);

            // Synthesize the competitive landscape
            const synthesisPrompt = `Act as a Senior Market Position Strategist.

Analyze the provided market data and competitor pricing data to generate a structured competitive landscape report. Identify key positioning gaps, emerging opportunities, and potential threats in the ${sector} sector for the ${region} region.

Market Data:
${JSON.stringify(marketData, null, 2)}

Competitor Data:
${JSON.stringify(competitorData, null, 2)}

Return a strictly valid JSON object matching this structure:
{
  "market_overview": "string",
  "competitor_summary": "string",
  "identified_gaps": ["string"],
  "opportunities": ["string"],
  "threats": ["string"]
}`;

            let landscapeReport: any = { status: "Analysis failed" };
            try {
                const response = await llm.generate(synthesisPrompt, []);
                const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    landscapeReport = JSON.parse(jsonMatch[0]);
                } else {
                    landscapeReport = JSON.parse(response.message || "{}");
                }
            } catch (e) {
                console.warn("LLM competitive landscape synthesis failed", e);
                landscapeReport = { error: (e as Error).message };
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        sector,
                        region,
                        timestamp: new Date().toISOString(),
                        ...landscapeReport
                    }, null, 2)
                }]
            };
        }
    );

    server.tool(
        "propose_positioning_adjustment",
        "Synthesizes competitive analysis with the current Corporate Strategy to generate actionable recommendations. Optionally triggers an automatic update to the Corporate Policy if high-confidence.",
        {
            competitive_analysis: z.string().describe("The JSON string representing the competitive landscape report."),
            company: z.string().optional().describe("The company/client identifier for namespacing."),
            auto_update_policy: z.boolean().optional().default(false).describe("If true, automatically update the corporate operating policy if the recommendation is high confidence.")
        },
        async ({ competitive_analysis, company, auto_update_policy }) => {
            const llm = createLLM();
            const companyId = company || "default";

            // Initialize Episodic Memory
            const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
            const episodic = new EpisodicMemory(baseDir);
            await episodic.init();

            // Fetch Current Corporate Strategy
            const strategyMemories = await episodic.recall("CorporateStrategy", 1, companyId, "CorporateStrategy");
            let corporateStrategy: CorporateStrategy | null = null;
            if (strategyMemories && strategyMemories.length > 0) {
                try {
                    corporateStrategy = JSON.parse(strategyMemories[0].agentResponse) as CorporateStrategy;
                } catch (e) {
                    console.warn("Failed to parse CorporateStrategy from memory", e);
                }
            }

            const strategyData = corporateStrategy || { message: "No active corporate strategy found in memory." };

            // Synthesize Positioning Proposal
            const proposalPrompt = `Act as the Chief Strategy Officer.

Analyze the competitive landscape report alongside the current Corporate Strategy.
Propose an actionable positioning adjustment for the agency. Determine if this adjustment warrants a high-confidence pivot that should immediately reflect in our standard operating parameters (e.g., adjusting minimum profit margins or risk tolerance).

Competitive Analysis:
${competitive_analysis}

Current Corporate Strategy:
${JSON.stringify(strategyData, null, 2)}

Return a strictly valid JSON object matching this structure:
{
  "recommendations": ["string (e.g., 'Emphasize healthcare compliance expertise in messaging')"],
  "rationale": "string",
  "high_confidence": boolean,
  "proposed_policy_changes": {
    "min_margin": number (0.0 to 1.0),
    "risk_tolerance": "low" | "medium" | "high"
  }
}`;

            let proposal: any = { error: "Failed to generate proposal" };
            try {
                const response = await llm.generate(proposalPrompt, []);
                const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    proposal = JSON.parse(jsonMatch[0]);
                } else {
                    proposal = JSON.parse(response.message || "{}");
                }
            } catch (e) {
                console.warn("LLM proposal generation failed", e);
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: (e as Error).message }) }]
                };
            }

            let policyUpdateResult = null;

            if (auto_update_policy && proposal.high_confidence && proposal.proposed_policy_changes) {
                // Ensure proposed policy changes meet the expected schema
                const margin = typeof proposal.proposed_policy_changes.min_margin === 'number'
                    ? proposal.proposed_policy_changes.min_margin : 0.2;
                const risk = ["low", "medium", "high"].includes(proposal.proposed_policy_changes.risk_tolerance)
                    ? proposal.proposed_policy_changes.risk_tolerance : "medium";

                try {
                    policyUpdateResult = await updateOperatingPolicyLogic(
                        "Positioning-Adjusted Operating Policy",
                        `Policy updated based on competitive landscape analysis: ${proposal.recommendations[0] || 'Market pivot'}`,
                        margin,
                        risk,
                        5, // default max agents
                        companyId,
                        episodic
                    );
                } catch (e) {
                    console.error("Failed to automatically update policy", e);
                    policyUpdateResult = { error: (e as Error).message };
                }
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        proposal,
                        policy_update: policyUpdateResult || "No automatic policy update performed."
                    }, null, 2)
                }]
            };
        }
    );
}
