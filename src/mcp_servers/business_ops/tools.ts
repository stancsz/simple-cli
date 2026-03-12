import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

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

  // Tool: Forecast Resource Demand
  server.tool(
    "forecast_resource_demand",
    "Calls the forecasting MCP server to predict resource consumption (e.g., token usage, API costs, infrastructure load) based on historical metrics.",
    {
      metric_name: z.string().describe("The name of the metric to forecast (e.g., 'llm_token_usage', 'api_latency')."),
      horizon_days: z.number().min(1).max(365).describe("Number of days into the future to forecast."),
      company: z.string().describe("The company/client identifier for context.")
    },
    async ({ metric_name, horizon_days, company }) => {
      let client: Client | null = null;
      try {
        const srcPath = join(process.cwd(), "src", "mcp_servers", "forecasting", "index.ts");
        const distPath = join(process.cwd(), "dist", "mcp_servers", "forecasting", "index.js");

        let command = "node";
        let args = [distPath];

        if (existsSync(srcPath) && !existsSync(distPath)) {
          command = "npx";
          args = ["tsx", srcPath];
        } else if (!existsSync(distPath)) {
          throw new Error(`Forecasting MCP Server not found at ${srcPath} or ${distPath}`);
        }

        const transport = new StdioClientTransport({ command, args });
        client = new Client({ name: "business_ops-client", version: "1.0.0" }, { capabilities: {} });

        await client.connect(transport);

        const result: any = await client.callTool({
          name: "forecast_metric",
          arguments: { metric_name, horizon_days, company }
        });

        if (result.isError) {
           return {
             content: [{ type: "text", text: `Error from forecasting server: ${JSON.stringify(result.content)}` }],
             isError: true
           };
        }

        return {
          content: [{ type: "text", text: result.content[0].text as string }]
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Failed to forecast resource demand: ${error.message}` }],
          isError: true
        };
      } finally {
        if (client) {
          try { await client.close(); } catch {}
        }
      }
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
