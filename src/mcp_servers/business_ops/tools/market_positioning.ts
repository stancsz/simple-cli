import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { MCP } from "../../../mcp.js";
import { CorporateStrategy } from "../../../brain/schemas.js";

export function registerMarketPositioningTools(server: McpServer) {
    server.tool(
        "analyze_and_adjust_positioning",
        "Autonomously analyzes competitive landscape and proposes updates to CorporateStrategy (vision, objectives, positioning) to maintain a competitive edge.",
        {
            sector: z.string().describe("The business sector (e.g., 'Software Development')."),
            region: z.string().describe("The region (e.g., 'US', 'Global')."),
            competitor_urls: z.array(z.string()).optional().describe("List of competitor URLs to analyze.")
        },
        async ({ sector, region, competitor_urls }) => {
            const mcp = new MCP();
            await mcp.init();
            const llm = createLLM();

            const brain = mcp.getClient("brain");
            const marketAnalysis = mcp.getClient("market_analysis");
            // Fallback to business_ops if market_analysis is merged into it
            const analysisClient = marketAnalysis || mcp.getClient("business_ops");

            if (!brain || !analysisClient) {
                return {
                    content: [{ type: "text", text: "Error: Could not connect to required MCP servers (brain, market_analysis/business_ops)." }],
                    isError: true
                };
            }

            // 1. Fetch current CorporateStrategy
            let currentStrategy: CorporateStrategy | null = null;
            try {
                const strategyRes = await brain.callTool({ name: "read_strategy", arguments: {} });
                if (strategyRes && strategyRes.content && strategyRes.content[0]) {
                    const strategyText = strategyRes.content[0].text;
                    if (strategyText !== "No corporate strategy found.") {
                        currentStrategy = JSON.parse(strategyText);
                    }
                }
            } catch (e: any) {
                console.warn("[Market Positioning] Failed to read current strategy:", e);
            }

            // 2. Fetch Market Data
            let marketDataStr = "No market data available.";
            try {
                const marketRes = await analysisClient.callTool({ name: "collect_market_data", arguments: { sector, region } });
                if (marketRes && marketRes.content && marketRes.content[0]) {
                    marketDataStr = marketRes.content[0].text;
                }
            } catch (e: any) {
                 console.warn("[Market Positioning] Failed to collect market data:", e);
            }

            // 3. Fetch Competitor Pricing (if requested)
            let competitorDataStr = "No competitor data analyzed.";
            if (competitor_urls && competitor_urls.length > 0) {
                try {
                     const compRes = await analysisClient.callTool({ name: "analyze_competitor_pricing", arguments: { competitor_urls } });
                     if (compRes && compRes.content && compRes.content[0]) {
                         competitorDataStr = compRes.content[0].text;
                     }
                } catch (e: any) {
                    console.warn("[Market Positioning] Failed to analyze competitor pricing:", e);
                }
            }

            // 4. Analyze via LLM
            const analysisPrompt = `You are the Chief Strategy Officer (CSO) of an autonomous AI agency.
Your task is to analyze the current corporate strategy against fresh market and competitor data, and propose necessary adjustments to our market positioning.

CURRENT CORPORATE STRATEGY:
${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "None established. Suggest an initial strategy."}

MARKET DATA (${sector}, ${region}):
${marketDataStr}

COMPETITOR DATA:
${competitorDataStr}

INSTRUCTIONS:
1. Synthesize the market trends and competitor weaknesses.
2. Given our current strategy and this market data, suggest specific updates to our agency's vision, objectives, and market positioning to capitalize on opportunities or counter threats. Focus on actionable, differentiated positioning.
3. Determine if a major strategic pivot is required (e.g., shifting target audience, major change to core value proposition). Set 'requires_pivot' to true only if a substantial change is needed. Otherwise, false.

OUTPUT FORMAT:
Return ONLY a strictly valid JSON object:
{
  "analysis": "A detailed Markdown report of your findings and reasoning.",
  "proposed_strategy": {
    "vision": "Updated vision statement incorporating positioning",
    "objectives": ["Updated objective 1", "Updated objective 2", "..."],
    "policies": {} // keep existing policies or add new high-level ones
  },
  "requires_pivot": true/false
}`;

            let analysisData;
            try {
                const genResponse = await llm.generate(analysisPrompt, []);
                let jsonStr = genResponse.message || genResponse.thought || "";
                jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
                const firstBrace = jsonStr.indexOf("{");
                const lastBrace = jsonStr.lastIndexOf("}");
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                }
                analysisData = JSON.parse(jsonStr);
            } catch (e: any) {
                return {
                     content: [{ type: "text", text: `Error generating analysis: ${e.message}` }],
                     isError: true
                };
            }

            // Ensure policies object exists
            if (!analysisData.proposed_strategy) {
                analysisData.proposed_strategy = { vision: "", objectives: [], policies: {} };
            }
            if (!analysisData.proposed_strategy.policies) {
                analysisData.proposed_strategy.policies = currentStrategy?.policies || {};
            }

            // 5. Trigger Governance Loop if Pivot Required
            let pivotStatus = "No significant pivot required; minor adjustments noted.";
            if (analysisData.requires_pivot) {
                 try {
                     const proposalPayload = JSON.stringify(analysisData.proposed_strategy);
                     await brain.callTool({
                         name: "propose_strategic_pivot",
                         arguments: { proposal: proposalPayload }
                     });
                     pivotStatus = "A major strategic pivot was identified. The proposal has been submitted to the Corporate Governance loop for board review.";
                 } catch (e: any) {
                     pivotStatus = `Strategic pivot recommended but submission failed: ${e.message}`;
                     console.error("[Market Positioning] Pivot submission failed:", e);
                 }
            }

            // 6. Return Report
            const report = `# Market Positioning Analysis
**Sector:** ${sector} | **Region:** ${region}
**Date:** ${new Date().toISOString()}

## Analysis
${analysisData.analysis}

## Strategic Assessment
**Pivot Required:** ${analysisData.requires_pivot ? "Yes" : "No"}
**Status:** ${pivotStatus}

### Proposed Strategy
**Vision:** ${analysisData.proposed_strategy.vision}
**Objectives:**
${analysisData.proposed_strategy.objectives.map((o: string) => `- ${o}`).join('\n')}
`;

            return {
                content: [{
                    type: "text",
                    text: report
                }]
            };
        }
    );
}
