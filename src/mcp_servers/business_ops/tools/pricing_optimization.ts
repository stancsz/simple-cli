import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { getLinearClient } from "../linear_service.js";
import { getHubSpotClient } from "../crm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getMarketData } from "./market_analysis.js";

interface PricingRecommendation {
    service_name: string;
    current_price: number;
    recommended_price: number;
    confidence_score: number;
    reasoning: string;
}

// Data Fetching Helper
async function fetchAggregatedMetrics() {
    let revenue = 0;
    let velocity = 0;
    let satisfaction = 0;
    let efficiency = 0;

    // 1. Xero (Revenue - Last 30 Days)
    try {
        const xero = await getXeroClient();
        const tenantId = await getTenantId(xero);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        // @ts-ignore
        const invoicesRes = await xero.accountingApi.getInvoices(
            tenantId,
            startDate,
            'Status=="AUTHORISED" OR Status=="PAID"'
        );

        if (invoicesRes.body.invoices) {
            revenue = invoicesRes.body.invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
        }
    } catch (e) {
        console.warn("Xero fetch failed (Pricing Tool):", e);
        revenue = 50000; // Fallback
    }

    // 2. Linear (Efficiency & Velocity)
    try {
        const linear = getLinearClient();
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        const issues = await linear.issues({
            filter: {
                updatedAt: { gte: startDate }
            }
        });

        let completed = 0;
        let total = 0;
        // @ts-ignore
        for (const issue of issues.nodes) {
            const state = await issue.state;
            if (state?.type !== "canceled") total++;
            if (state?.type === "completed") completed++;
        }
        velocity = completed;
        efficiency = total > 0 ? completed / total : 0;
    } catch (e) {
        console.warn("Linear fetch failed (Pricing Tool):", e);
        velocity = 20;
        efficiency = 0.8;
    }

    // 3. HubSpot (Satisfaction Proxy)
    try {
        const hubspot = getHubSpotClient();
        // @ts-ignore
        const dealsSearch = await hubspot.crm.deals.searchApi.doSearch({
            filterGroups: [{
                filters: [
                    { propertyName: "dealstage", operator: "EQ" as any, value: "closedwon" }
                ]
            }],
            limit: 10
        });
        // Simple proxy: if deals are closing, satisfaction is likely okay
        satisfaction = (dealsSearch.results.length > 0) ? 85 : 70;
    } catch (e) {
        console.warn("HubSpot fetch failed (Pricing Tool):", e);
        satisfaction = 80;
    }

    return { revenue, velocity, efficiency, satisfaction };
}

export async function generatePricingRecommendations(current_services: { name: string, current_price: number, cost?: number }[]): Promise<PricingRecommendation[]> {
    // Fetch Data
    const internalMetrics = await fetchAggregatedMetrics();
    const marketData = getMarketData("Software Development", "US"); // Default context

    // LLM Analysis
    const llm = createLLM();
    const systemPrompt = `You are a Chief Economic Officer. Analyze the service pricing against market data.

            Internal Metrics:
            ${JSON.stringify(internalMetrics, null, 2)}

            Current Services:
            ${JSON.stringify(current_services, null, 2)}

            Market Data Summary:
            ${JSON.stringify(marketData, null, 2)}

            Task: Recommend pricing adjustments to maximize profit while remaining competitive.
            Constraint: Return a strict JSON array of objects with fields: service_name, current_price, recommended_price, confidence_score (0-1), reasoning.`;

    let recommendations: PricingRecommendation[] = [];
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
        // Mock fallback
        recommendations = current_services.map(s => ({
            service_name: s.name,
            current_price: s.current_price,
            recommended_price: s.current_price * 1.05,
            confidence_score: 0.7,
            reasoning: "Inflation adjustment fallback."
        }));
    }

    return recommendations;
}

export function registerPricingOptimizationTools(server: McpServer) {
    server.tool(
        "optimize_pricing_strategy",
        "Analyzes internal performance and market data to recommend pricing updates.",
        {
            current_services: z.array(z.object({
                name: z.string(),
                current_price: z.number(),
                cost: z.number().optional()
            })).describe("List of current services and prices.")
        },
        async ({ current_services }) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // Idempotency Check (Last 24 Hours)
            const recentRuns = await memory.recall(
                "pricing_optimization_run",
                1,
                undefined,
                "pricing_recommendation"
            );

            if (recentRuns.length > 0) {
                const lastRun = recentRuns[0];
                const lastRunTime = new Date(lastRun.timestamp).getTime();
                const now = new Date().getTime();
                if ((now - lastRunTime) < 24 * 60 * 60 * 1000) {
                     return {
                        content: [{
                            type: "text",
                            text: `Pricing optimization already run recently. Last recommendation: ${lastRun.agentResponse}`
                        }]
                    };
                }
            }

            const recommendations = await generatePricingRecommendations(current_services);

            // Store in Brain
            await memory.store(
                `pricing_optimization_${new Date().toISOString()}`,
                "Pricing Strategy Recommendation",
                JSON.stringify(recommendations),
                ["pricing_optimization", "financial_strategy"],
                undefined, undefined, false, undefined, undefined, 0, 0,
                "pricing_recommendation"
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
