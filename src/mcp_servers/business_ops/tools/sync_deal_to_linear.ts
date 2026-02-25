import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { syncDeal } from "../linear_service.js";

export function registerSyncDealToLinear(server: McpServer) {
    server.tool(
        "sync_deal_to_linear",
        "Idempotent tool that ensures a Linear project exists for a HubSpot deal and creates initial tasks.",
        {
            dealId: z.string().describe("HubSpot Deal ID."),
            dealName: z.string().describe("Name of the deal."),
            amount: z.number().optional().describe("Deal amount."),
            stage: z.string().optional().describe("Deal stage.")
        },
        async ({ dealId, dealName, amount, stage }) => {
            try {
                const result = await syncDeal(dealId, dealName, amount, stage);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error syncing deal to Linear: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
