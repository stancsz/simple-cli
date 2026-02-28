import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getXeroClient, getTenantId } from "../xero_tools.js";
import { readStrategy } from "../../brain/tools/strategy.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";

export function registerRevenueMetricsTools(server: McpServer) {
    server.tool(
        "track_revenue_growth",
        "Tracks revenue growth by querying Xero and comparing against corporate strategy targets.",
        {
            period: z.enum(["last_month", "last_quarter"]).describe("The period to analyze."),
            company: z.string().optional().describe("Company context")
        },
        async ({ period, company }) => {
            try {
                // Initialize Xero
                const xero = await getXeroClient();
                const tenantId = await getTenantId(xero);

                // Calculate dates based on period
                const now = new Date();
                let fromDate = new Date();
                let toDate = new Date();

                if (period === 'last_month') {
                    fromDate.setDate(1); // Set to 1st to avoid rollover when changing month
                    fromDate.setMonth(now.getMonth() - 1);
                    toDate.setDate(0); // last day of previous month
                } else { // last_quarter
                    const currentQuarter = Math.floor(now.getMonth() / 3);
                    fromDate.setDate(1); // Set to 1st to avoid rollover when changing month
                    fromDate.setMonth((currentQuarter - 1) * 3);
                    toDate.setDate(1); // Set to 1st to avoid rollover when changing month
                    toDate.setMonth(currentQuarter * 3);
                    toDate.setDate(0); // last day of previous quarter
                }

                const fromDateStr = fromDate.toISOString().split('T')[0];
                const toDateStr = toDate.toISOString().split('T')[0];

                // Fetch financial data from Xero
                const response = await xero.accountingApi.getReportProfitAndLoss(
                    tenantId,
                    fromDateStr,
                    toDateStr
                );

                const pnlData = response.body;

                // Load corporate strategy to compare targets
                const episodic = new EpisodicMemory();
                await episodic.init();
                const strategy = await readStrategy(episodic, company);

                // Synthesize the metrics and generate a score using LLM
                const llm = createLLM();

                const prompt = `You are a Chief Financial Officer AI.
Analyze the following P&L data and corporate strategy to calculate key growth metrics and a growth score.

P&L Data (from Xero):
${JSON.stringify(pnlData)}

Corporate Strategy Targets:
${strategy ? JSON.stringify(strategy) : "No specific strategy targets found. Use standard growth benchmarks."}

Calculate or estimate (if exact data is missing, make reasonable inferences based on P&L revenue vs expenses):
1. MRR/ARR growth rate (%)
2. Customer Acquisition Cost (CAC)
3. Lifetime Value (LTV)
4. Lead-to-close conversion rate (%)

Provide a final 'growth_score' between 0 and 100 representing how well the company is expanding against its strategy.
If targets are being met or exceeded, the score should be > 70.

OUTPUT FORMAT: Return ONLY a valid JSON object matching this schema:
{
  "metrics": {
    "mrr_arr_growth_rate": number,
    "cac": number,
    "ltv": number,
    "lead_to_close_rate": number
  },
  "growth_score": number,
  "report": "string - brief analysis of the growth"
}
`;

                const llmResponse = await llm.generate(prompt, []);

                let parsedResult;
                try {
                    let jsonStr = llmResponse.message || llmResponse.thought || "";
                    jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
                    const firstBrace = jsonStr.indexOf("{");
                    const lastBrace = jsonStr.lastIndexOf("}");
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    }
                    parsedResult = JSON.parse(jsonStr);
                } catch (e: any) {
                    throw new Error(`Failed to parse LLM response for revenue metrics: ${e.message}`);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(parsedResult, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error tracking revenue growth: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
