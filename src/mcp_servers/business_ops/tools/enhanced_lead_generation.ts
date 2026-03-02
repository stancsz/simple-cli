import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm/index.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getMarketData, analyzeCompetitorPricingInternal } from "./market_analysis.js";
import { syncContactToHubSpot, syncCompanyToHubSpot } from "../crm.js";
import { getGrowthTargets } from "../../brain/tools/strategic_growth.js";

// Simulating the tools we are supposed to call if they were cross-server,
// but sharing the DB/LLM objects directly since we're in the same codebase
// and don't have a cross-server client established in this environment yet.
// We strictly use `getGrowthTargets` which acts as our proxy to the Brain's strategy.
// We also use `getMarketData` directly as it's an exported local function.

export function registerEnhancedLeadGenerationTools(server: McpServer) {
    server.tool(
        "discover_strategic_leads",
        "Discovers and qualifies leads based on Corporate Strategy and Market Data. High-confidence leads are synced to HubSpot.",
        {
            company: z.string().optional().describe("The company/client identifier for namespacing.")
        },
        async ({ company }) => {
            try {
                const episodic = new EpisodicMemory();
                await episodic.init();
                const llm = createLLM();

                // 1. Fetch Strategic Growth Targets (Equivalent to calling get_growth_targets from Brain)
                const growthTargets = await getGrowthTargets(episodic, llm, company);

                if (!growthTargets || !growthTargets.target_markets || growthTargets.target_markets.length === 0) {
                    return {
                        content: [{ type: "text", text: "No target markets found in strategy." }],
                        isError: true
                    };
                }

                // 2. Collect Market Data and Competitor Pricing for Target Markets
                const marketData: any[] = [];
                const competitorPricing: any[] = [];

                for (const market of growthTargets.target_markets) {
                    // Extract sector and region from the market string if possible, otherwise default
                    // This is simplified for the simulation
                    const sector = market.includes(" ") ? market.split(" ")[0] : market;
                    const region = "Global";

                    const data = await getMarketData(sector, region);
                    marketData.push(data);

                    // Also gather competitor pricing analysis for mock competitors in this sector
                    // In a real scenario, these URLs would be discovered dynamically or pulled from CRM/Brain
                    const mockCompetitorUrl = `https://mock-${sector.toLowerCase()}-competitor.com`;
                    const pricingData = await analyzeCompetitorPricingInternal([mockCompetitorUrl]);
                    competitorPricing.push(...pricingData);
                }

                // 3. LLM Synthesis to Generate Strategic Leads
                const prompt = `You are an expert Lead Generation Specialist.
Using the following Corporate Growth Targets and Market Data, generate a list of high-value strategic leads.

GROWTH TARGETS:
${JSON.stringify(growthTargets, null, 2)}

MARKET DATA:
${JSON.stringify(marketData, null, 2)}

COMPETITOR PRICING:
${JSON.stringify(competitorPricing, null, 2)}

TASK:
Synthesize this information to generate exactly 2 potential lead companies that perfectly fit the ICP attributes.
For each lead, provide a 'strategic_fit_score' (0-100) and details.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "leads": [
    {
      "company_name": "string",
      "company_domain": "string",
      "contact_email": "string",
      "contact_name": "string",
      "strategic_fit_score": number,
      "rationale": "string explaining why this is a good fit based on the strategy"
    }
  ]
}`;

                const response = await llm.generate(prompt, []);
                let leads: any[] = [];
                try {
                    let jsonStr = response.message || response.thought || "";
                    jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

                    const firstBrace = jsonStr.indexOf("{");
                    const lastBrace = jsonStr.lastIndexOf("}");
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    }

                    const data = JSON.parse(jsonStr);
                    leads = Array.isArray(data.leads) ? data.leads : [];
                } catch (e: any) {
                    throw new Error(`Failed to parse LLM response for leads: ${e.message}`);
                }

                // 4. Store in Brain and Sync to CRM
                const processedLeads = [];
                for (const lead of leads) {
                    // Store in Episodic Memory
                    const memoryData = {
                        ...lead,
                        timestamp: new Date().toISOString()
                    };

                    await episodic.store(
                        `strategic_lead_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        "Strategic lead discovery",
                        JSON.stringify(memoryData),
                        ["lead_generation", "strategic_growth"],
                        company,
                        undefined,
                        false,
                        undefined,
                        undefined,
                        0,
                        0,
                        "strategic_lead"
                    );

                    // Sync high-confidence leads to CRM (>80 score)
                    let crmStatus = "Not Synced (Score too low)";
                    if (lead.strategic_fit_score >= 80) {
                        try {
                            // Sync Company
                            await syncCompanyToHubSpot({
                                name: lead.company_name,
                                domain: lead.company_domain,
                                industry: growthTargets.icp_attributes?.industry || "Unknown"
                            });

                            // Sync Contact
                            await syncContactToHubSpot({
                                email: lead.contact_email,
                                firstname: lead.contact_name?.split(" ")[0],
                                lastname: lead.contact_name?.split(" ").slice(1).join(" "),
                                company: lead.company_name,
                                lifecyclestage: "lead"
                            });
                            crmStatus = "Synced to HubSpot";
                        } catch (e: any) {
                            crmStatus = `Sync Failed: ${e.message}`;
                            console.error(`Failed to sync lead ${lead.contact_email} to HubSpot:`, e);
                        }
                    }

                    processedLeads.push({
                        ...lead,
                        crm_status: crmStatus
                    });
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            growth_targets_used: growthTargets,
                            competitors_analyzed: competitorPricing.length,
                            leads_discovered: processedLeads
                        }, null, 2)
                    }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error discovering strategic leads: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
