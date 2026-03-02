import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import TurndownService from "turndown";
import { createLLM } from "../../../llm/index.js";
import { EpisodicMemory } from "../../../brain/episodic.js";

interface CompetitorOffering {
    plan: string;
    price: number | string;
    period: string;
    features: string[];
}

interface CompetitorAnalysis {
    url: string;
    pricing_model: string;
    extracted_offerings: CompetitorOffering[];
    value_proposition: string;
    strengths: string[];
    weaknesses: string[];
    target_audience: string;
    last_analyzed: string;
}

async function fetchAndAnalyze(url: string, llm: ReturnType<typeof createLLM>): Promise<CompetitorAnalysis> {
    try {
        // Basic URL validation to prevent SSRF
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            throw new Error("Invalid protocol. Only http and https are allowed.");
        }
        if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsedUrl.hostname)) {
             throw new Error("Access to local resources is denied.");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; MarketBot/1.0; +http://example.com/bot)"
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`Status ${response.status}`);

        const html = await response.text();
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(html);

        // Truncate markdown to avoid token limits
        const truncatedMarkdown = markdown.substring(0, 15000);

        const prompt = `Analyze this competitor's website content and extract pricing and offering details.

Content:
${truncatedMarkdown}

Return a strictly valid JSON object matching this structure:
{
  "pricing_model": "string (e.g. Tiered Subscription, Custom Quote, Flat Rate)",
  "extracted_offerings": [
     { "plan": "string", "price": number or "string", "period": "month/year", "features": ["string"] }
  ],
  "value_proposition": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "target_audience": "string"
}`;

        const llmResponse = await llm.generate(prompt, []);
        const jsonMatch = llmResponse.message?.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(llmResponse.message || "{}");

        return {
            url,
            pricing_model: data.pricing_model || "Unknown",
            extracted_offerings: data.extracted_offerings || [],
            value_proposition: data.value_proposition || "Unknown",
            strengths: data.strengths || [],
            weaknesses: data.weaknesses || [],
            target_audience: data.target_audience || "Unknown",
            last_analyzed: new Date().toISOString()
        };

    } catch (e) {
        console.error(`Failed to analyze ${url}:`, e);
        // Return a fallback "failed" analysis rather than crashing
        return {
            url,
            pricing_model: "Error",
            extracted_offerings: [],
            value_proposition: `Analysis failed: ${(e as Error).message}`,
            strengths: [],
            weaknesses: [],
            target_audience: "Unknown",
            last_analyzed: new Date().toISOString()
        };
    }
}

export async function analyzeCompetitorPricingInternal(competitor_urls: string[], force_refresh: boolean = false): Promise<CompetitorAnalysis[]> {
    const memory = new EpisodicMemory();
    await memory.init();
    const llm = createLLM();

    const results: CompetitorAnalysis[] = [];

    for (const url of competitor_urls) {
        let analysis: CompetitorAnalysis | null = null;

        if (!force_refresh) {
            // Check Cache
            try {
                const episodes = await memory.recall(url, 1, undefined, "competitor_analysis");
                if (episodes.length > 0) {
                     // Check freshness (e.g. 7 days)
                     const lastRun = episodes[0];
                     const age = Date.now() - lastRun.timestamp;
                     if (age < 7 * 24 * 60 * 60 * 1000) {
                         const parsed = JSON.parse(lastRun.agentResponse);
                         // Simple check if it looks like our schema
                         if (parsed.url === url) {
                             analysis = parsed;
                         }
                     }
                }
            } catch (e) {
                console.warn(`Cache lookup failed for ${url}`, e);
            }
        }

        if (!analysis) {
            // Fetch fresh
            analysis = await fetchAndAnalyze(url, llm);

            // Store in Cache
            try {
                // Using 'default' company for now as per simple-cli usage,
                // but allowing caller to specify context in future refactors.
                 await memory.store(
                     `analyze_competitor_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                     `Analyze competitor: ${url}`,
                     JSON.stringify(analysis),
                     ["market_analysis", "competitor_pricing"],
                     undefined,
                     [],
                     false,
                     undefined,
                     undefined,
                     0,
                     0,
                     "competitor_analysis"
                 );
            } catch (e) {
                console.warn(`Cache store failed for ${url}`, e);
            }
        }

        if (analysis) results.push(analysis);
    }

    return results;
}

export async function getMarketData(sector: string, region: string) {
    // In a production environment, this would integrate with market research APIs (e.g., Crunchbase, Statista)
    // or perform broad web searches. For this implementation, we simulate structured market intelligence
    // to enable the optimization loop.

    const baseRate = sector.toLowerCase().includes("software") ? 150 : 100;
    const growthRate = sector.toLowerCase().includes("ai") ? "12.5%" : "5.2%";

    return {
        sector,
        region,
        timestamp: new Date().toISOString(),
        market_growth_rate: growthRate,
        average_hourly_rates: {
            junior: { min: baseRate * 0.4, max: baseRate * 0.6, currency: "USD" },
            senior: { min: baseRate * 0.8, max: baseRate * 1.2, currency: "USD" },
            expert: { min: baseRate * 1.5, max: baseRate * 2.5, currency: "USD" }
        },
        key_trends: [
            "Shift towards AI-driven automation",
            "Increased demand for specialized security audits",
            "Rise of fractional CTO services"
        ],
        competitor_density: "High",
        demand_score: 85 // 0-100 scale
    };
}

export function registerMarketAnalysisTools(server: McpServer) {
    // Tool: Collect Market Data
    server.tool(
        "collect_market_data",
        "Collects market data for a specific sector and region, using simulated data augmented by LLM analysis.",
        {
            sector: z.string().describe("The business sector (e.g., 'Software Development')."),
            region: z.string().describe("The region (e.g., 'US', 'Global')."),
            query: z.string().optional().describe("Specific query or focus area.")
        },
        async ({ sector, region, query }) => {
            const simulatedData = await getMarketData(sector, region);

            // Enhance with LLM analysis
            const llm = createLLM();
            const enhancementPrompt = `Act as a Senior Market Research Analyst.

            Simulated Data:
            ${JSON.stringify(simulatedData)}

            User Query: ${query || "Provide general market overview"}

            Task: Synthesize a market analysis report. Expand on the simulated data with your own knowledge of the ${sector} industry in ${region}.
            Add specific emerging trends, regulatory considerations, and strategic opportunities.

            Return a JSON object merging the simulated data with your new insights under an "analysis" field.`;

            let finalData: any = simulatedData;
            try {
                const response = await llm.generate(enhancementPrompt, []);
                const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const analysis = JSON.parse(jsonMatch[0]);
                    finalData = { ...simulatedData, ...analysis };
                }
            } catch (e) {
                console.warn("LLM market analysis enhancement failed, returning base data", e);
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(finalData, null, 2)
                }]
            };
        }
    );

    // Tool: Analyze Competitor Pricing
    server.tool(
        "analyze_competitor_pricing",
        "Analyzes pricing models from competitor websites, caching results to avoid redundant scraping.",
        {
            competitor_urls: z.array(z.string()).describe("List of competitor URLs to analyze."),
            force_refresh: z.boolean().optional().default(false).describe("If true, ignores cache and re-scrapes.")
        },
        async ({ competitor_urls, force_refresh }) => {
            const results = await analyzeCompetitorPricingInternal(competitor_urls, force_refresh);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(results, null, 2)
                }]
            };
        }
    );
}
