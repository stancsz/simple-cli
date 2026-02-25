import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock Data Interfaces
interface FinancialData {
  revenue: number;
  expenses: number;
  profit: number;
  currency: string;
  period: string;
}

interface CRMContact {
  id: string;
  name: string;
  email: string;
  company: string;
  status: string;
}

interface ProjectStatus {
  ticket_id: string;
  status: string;
  updated_at: string;
}

export function registerTools(server: McpServer) {
  // Tool: Query Financials
  server.tool(
    "query_financials",
    "Query financial data (P&L) for a specific period.",
    {
      period: z.enum(["current_month", "last_month", "ytd", "last_year"]).describe("The time period to query."),
      department: z.string().optional().describe("Filter by department (e.g., 'engineering', 'sales').")
    },
    async ({ period, department }) => {
      // Mock Data Generation
      const baseRevenue = 150000;
      const baseExpenses = 80000;
      const multiplier = period === "ytd" ? 3 : (period === "last_year" ? 12 : 1);

      const revenue = baseRevenue * multiplier * (Math.random() * 0.2 + 0.9); // +/- 10%
      const expenses = baseExpenses * multiplier * (Math.random() * 0.2 + 0.9);
      const profit = revenue - expenses;

      const data: FinancialData = {
        revenue: Math.round(revenue),
        expenses: Math.round(expenses),
        profit: Math.round(profit),
        currency: "USD",
        period: period
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(data, null, 2)
        }]
      };
    }
  );

  // Tool: Update Project Status
  server.tool(
    "update_project_status",
    "Update the status of a project management ticket (e.g., Jira/Linear).",
    {
      ticket_id: z.string().describe("The ID of the ticket (e.g., PROJ-123)."),
      status: z.enum(["todo", "in_progress", "review", "done"]).describe("The new status."),
      comment: z.string().optional().describe("Optional comment to add.")
    },
    async ({ ticket_id, status, comment }) => {
      // Mock Update
      const update: ProjectStatus = {
        ticket_id,
        status,
        updated_at: new Date().toISOString()
      };

      let message = `Updated ticket ${ticket_id} to '${status}'.`;
      if (comment) {
        message += ` Added comment: "${comment}"`;
      }

      return {
        content: [{
          type: "text",
          text: message
        }]
      };
    }
  );
}
