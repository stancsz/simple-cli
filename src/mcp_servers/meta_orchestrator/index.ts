import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { discoverPartnerAgencies, delegateCrossAgencyTask, monitorCrossAgencyProgress } from "./tools/index.js";

export class MetaOrchestratorServer {
  public server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "meta_orchestrator",
      version: "1.0.0",
    });

    this.server.tool(
      "discover_agencies",
      "Discover active partner agencies available for task delegation via Federation Protocol.",
      {
        capability_required: z.string().optional().describe("Filter to only return agencies offering this capability.")
      },
      async ({ capability_required }) => {
        const result = await discoverPartnerAgencies(capability_required);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );

    this.server.tool(
      "delegate_cross_agency_task",
      "Delegate a task to a partner agency, enforcing policy constraints and logging coordination patterns.",
      {
        task_id: z.string().describe("The unique identifier for this delegated task."),
        agency_id: z.string().describe("The target agency ID to delegate to."),
        task_description: z.string().describe("The detailed description of the task to perform."),
        capability_required: z.string().optional().describe("The specific capability requested, if any.")
      },
      async ({ task_id, agency_id, task_description, capability_required }) => {
        const result = await delegateCrossAgencyTask({ task_id, agency_id, task_description, capability_required });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );

    this.server.tool(
      "monitor_cross_agency_progress",
      "Monitor the status of tasks delegated to partner agencies.",
      {
        task_ids: z.array(z.string()).describe("List of task IDs to query status for.")
      },
      async ({ task_ids }) => {
        const result = await monitorCrossAgencyProgress(task_ids);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );
  }

  async start() {
    console.error("Starting Meta-Orchestrator MCP Server...");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Meta-Orchestrator MCP Server running on stdio");
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const server = new MetaOrchestratorServer();
  server.start().catch((error) => {
    console.error("Fatal error starting Meta-Orchestrator server:", error);
    process.exit(1);
  });
}
