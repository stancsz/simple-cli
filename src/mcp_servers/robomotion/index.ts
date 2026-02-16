import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

interface RobomotionStatus {
  connected: boolean;
  active_actions: string[];
  last_event: string | null;
}

const status: RobomotionStatus = {
  connected: true, // Mock connection to runtime
  active_actions: [],
  last_event: null,
};

const server = new McpServer({
  name: "robomotion-mcp",
  version: "1.0.0",
});

server.tool(
  "trigger_action",
  "Trigger an RPA action on the Robomotion runtime.",
  {
    action_id: z.string().describe("ID of the action flow to trigger"),
    parameters: z.record(z.any()).optional().describe("Input parameters for the action"),
  },
  async ({ action_id, parameters }) => {
    if (!status.connected) {
       return {
         isError: true,
         content: [{ type: "text", text: "Error: Not connected to Robomotion runtime." }],
       };
    }

    status.active_actions.push(action_id);
    status.last_event = `Action ${action_id} started at ${new Date().toISOString()}`;

    // Simulate async execution
    setTimeout(() => {
        const index = status.active_actions.indexOf(action_id);
        if (index > -1) {
            status.active_actions.splice(index, 1);
        }
        status.last_event = `Action ${action_id} completed at ${new Date().toISOString()}`;
    }, 2000);

    return {
      content: [
        {
          type: "text",
          text: `Triggered action '${action_id}' with parameters: ${JSON.stringify(parameters || {})}`,
        },
      ],
    };
  }
);

server.tool(
  "get_status",
  "Get the status of the Robomotion runtime and active actions.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Robomotion MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
