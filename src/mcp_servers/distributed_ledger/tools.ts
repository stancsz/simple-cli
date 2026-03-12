import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory, LedgerEntry } from "../../brain/episodic.js";
import { recordTransaction, getAgencyBalance, proposeSettlement } from "./ledger.js";

export function registerLedgerTools(server: McpServer, episodic: EpisodicMemory) {
  server.tool(
    "record_contribution",
    "Records a contribution or resource usage between agencies in the distributed ledger.",
    {
      id: z.string().describe("Unique identifier for the transaction to ensure idempotency."),
      from_agency: z.string().describe("The agency providing the resource or contribution."),
      to_agency: z.string().describe("The agency receiving the resource or contribution."),
      resource_type: z.string().describe("Type of resource (e.g., 'llm_tokens', 'compute_minutes', 'revenue')."),
      quantity: z.number().describe("Amount of the resource."),
      value: z.number().describe("Equivalent value in USD."),
      status: z.enum(["pending", "settled"]).describe("Status of the transaction."),
      company: z.string().optional().describe("Company context namespace."),
    },
    async ({ id, from_agency, to_agency, resource_type, quantity, value, status, company }) => {
      try {
        const entry: LedgerEntry = {
          id,
          timestamp: Date.now(),
          from_agency,
          to_agency,
          resource_type,
          quantity,
          value,
          status,
        };
        const entries = await recordTransaction(episodic, entry, company);
        return {
          content: [{ type: "text", text: `Transaction recorded successfully.\n\n${JSON.stringify(entries, null, 2)}` }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to record transaction: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_agency_balance",
    "Queries the distributed ledger to get the current balance and net value of an agency's contributions.",
    {
      agency_name: z.string().describe("The name of the agency to query."),
      company: z.string().optional().describe("Company context namespace."),
    },
    async ({ agency_name, company }) => {
      try {
        const balances = await getAgencyBalance(episodic, agency_name, company);
        return {
          content: [{ type: "text", text: JSON.stringify(balances, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to retrieve balance for ${agency_name}: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "propose_settlement",
    "Proposes a settlement between two agencies to reconcile outstanding balances.",
    {
      from_agency: z.string().describe("The agency proposing the settlement (paying the amount)."),
      to_agency: z.string().describe("The agency receiving the settlement."),
      amount: z.number().describe("The amount to settle (in the given resource type)."),
      resource_type: z.string().describe("The type of resource being settled."),
      company: z.string().optional().describe("Company context namespace."),
    },
    async ({ from_agency, to_agency, amount, resource_type, company }) => {
      try {
        const settlement = await proposeSettlement(episodic, from_agency, to_agency, amount, resource_type, company);
        return {
          content: [{ type: "text", text: `Settlement proposed successfully.\n\n${JSON.stringify(settlement, null, 2)}` }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Failed to propose settlement: ${e.message}` }],
          isError: true,
        };
      }
    }
  );
}
