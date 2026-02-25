import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { WorkflowRegistry } from "./workflows.js";
import { ReportingEngine } from "./reporting.js";
import { EscalationManager } from "./escalation.js";

const server = new McpServer({
  name: "agency_operations",
  version: "1.0.0",
});

const registry = new WorkflowRegistry();
const reporting = new ReportingEngine(registry);
const escalation = new EscalationManager(registry);

server.tool(
  "register_workflow",
  "Register a new workflow for a client.",
  {
    client: z.string().describe("Client ID (company ID)."),
    type: z.string().describe("Type of workflow (e.g., 'client_onboarding')."),
    schedule: z.string().optional().describe("Cron schedule."),
  },
  async ({ client, type, schedule }) => {
    const wf = await registry.register(client, type, schedule);
    return { content: [{ type: "text", text: `Workflow registered: ${wf.id}` }] };
  }
);

server.tool(
  "list_workflows",
  "List active workflows, optionally filtered by client.",
  {
    client: z.string().optional().describe("Client ID filter.")
  },
  async ({ client }) => {
    const wfs = await registry.list(client);
    return { content: [{ type: "text", text: JSON.stringify(wfs, null, 2) }] };
  }
);

server.tool(
  "update_workflow_status",
  "Update the status of a workflow.",
  {
    id: z.string().describe("Workflow ID."),
    status: z.enum(['active', 'paused', 'escalated', 'completed']).describe("New status."),
    message: z.string().optional().describe("Reason for update.")
  },
  async ({ id, status, message }) => {
    try {
      const wf = await registry.updateStatus(id, status as any, message);
      return { content: [{ type: "text", text: `Workflow ${id} updated to ${status}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

server.tool(
  "generate_client_report",
  "Generate a status report for a client.",
  {
    client: z.string().describe("Client ID.")
  },
  async ({ client }) => {
    const report = await reporting.generateReport(client);
    return { content: [{ type: "text", text: report }] };
  }
);

server.tool(
  "escalate_issue",
  "Escalate a workflow issue to human operators.",
  {
    workflow_id: z.string().describe("ID of the failing workflow."),
    reason: z.string().describe("Reason for escalation.")
  },
  async ({ workflow_id, reason }) => {
    try {
      const result = await escalation.escalate(workflow_id, reason);
      return { content: [{ type: "text", text: result.message }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
  }
);

async function main() {
  if (process.env.PORT) {
      const app = express();
      const transport = new StreamableHTTPServerTransport();
      await server.connect(transport);

      const publicDir = join(process.cwd(), 'src/mcp_servers/agency_operations/public');
      app.use(express.static(publicDir));

      app.all("/sse", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      app.post("/messages", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      // API Endpoint for Dashboard
      app.get("/api/workflows", async (req, res) => {
          const wfs = await registry.list();
          res.json(wfs);
      });

      const port = process.env.PORT;
      app.listen(port, () => {
          console.error(`Agency Operations running on http://localhost:${port}/sse`);
          console.error(`Dashboard available at http://localhost:${port}/`);
      });
  } else {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("Agency Operations MCP Server running on stdio");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
