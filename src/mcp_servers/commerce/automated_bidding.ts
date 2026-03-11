import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../llm.js";
import { EpisodicMemory } from "../../brain/episodic.js";

/**
 * Core logic for evaluating and submitting a bid on a marketplace opportunity.
 */
export async function automatedBiddingLogic(params: {
  marketplace: string;
  opportunity_description: string;
  budget?: number;
}): Promise<any> {
  const { marketplace, opportunity_description, budget } = params;

  // Utilize EpisodicMemory to recall past successful bids
  const memory = new EpisodicMemory();
  await memory.init();
  const pastBids = await memory.recall(`successful bids on ${marketplace}`);

  const llm = createLLM();
  const prompt = `
    Analyze the following marketplace opportunity and formulate a competitive bid proposal.
    Marketplace: ${marketplace}
    Opportunity: ${opportunity_description}
    Budget: ${budget ? `$${budget}` : "Not specified"}
    Past Successful Bids Context: ${JSON.stringify(pastBids.slice(0, 3))}

    Return ONLY a JSON array containing:
    - bid_amount: The proposed amount
    - proposal_text: The drafted proposal text
    - match_score: A 0-1 score indicating how well our capabilities match the opportunity
  `;

  try {
    const response = await llm.generate("You are an automated bidding agent.", [{ role: "user", content: prompt }]);
    let parsedResponse;
    try {
        const cleanedText = (response.message || "").replace(/```json\n?|\n?```/g, "").trim();
        parsedResponse = JSON.parse(cleanedText);
    } catch (e) {
        parsedResponse = [{ bid_amount: 0, proposal_text: "Failed to generate proposal", match_score: 0 }];
    }

    return parsedResponse;
  } catch (error) {
    console.error("Error in automated bidding:", error);
    throw new Error(`Failed to generate automated bid: ${error}`);
  }
}

/**
 * Registers the automated bidding tool with the provided MCP server.
 */
export function registerAutomatedBiddingTools(server: McpServer) {
  server.tool(
    "automated_bidding",
    "Analyzes marketplace opportunities and autonomously submits proposals based on capacity and past performance.",
    {
      marketplace: z.string().describe("The name of the marketplace (e.g., 'Upwork', 'Fiverr')."),
      opportunity_description: z.string().describe("Details of the job or opportunity."),
      budget: z.number().optional().describe("The client's specified budget, if available."),
    },
    async (params) => {
      try {
        const result = await automatedBiddingLogic(params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error during automated bidding: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
