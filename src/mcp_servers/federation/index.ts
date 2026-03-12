import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAgency, discoverAgencies, delegateTask } from "./tools.js";
import { AgencyProfileSchema, TaskDelegationRequestSchema } from "./protocol.js";
import { z } from "zod";

export class FederationMcpServer {
  public server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "federation",
      version: "1.0.0",
    });

    this.server.tool(
      "register_agency",
      "Register an agency profile to participate in the multi-agency federation network.",
      {
        profile: AgencyProfileSchema.describe("The agency profile containing capabilities and connection details.")
      },
      async ({ profile }) => {
        const result = await registerAgency(profile);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );

    this.server.tool(
      "discover_agencies",
      "Discover active agencies in the federation network, optionally filtered by a specific capability.",
      {
        capability_required: z.string().optional().describe("Filter to only return agencies offering this capability.")
      },
      async ({ capability_required }) => {
        const result = await discoverAgencies(capability_required);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );

    this.server.tool(
      "delegate_to_agency",
      "Delegate a task securely to a partner agency in the federation network via RPC.",
      {
        request: TaskDelegationRequestSchema.describe("The task delegation payload containing target agency and task details."),
        api_key: z.string().optional().describe("Optional API key or auth token for the target agency.")
      },
      async ({ request, api_key }) => {
        const result = await delegateTask(request, api_key);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
    );
  }

  async start() {
    console.error("Starting Federation MCP Server...");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Federation MCP Server running on stdio");
  }
}

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const server = new FederationMcpServer();
  server.start().catch((error) => {
    console.error("Fatal error starting Federation server:", error);
    process.exit(1);
  });
}
