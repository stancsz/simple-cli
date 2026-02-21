import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { AgentContextManager } from "../context/manager.js";

const server = new McpServer({
  name: "context_server",
  version: "1.0.0",
});

const manager = new AgentContextManager();

server.tool(
  "read_context",
  "Read the current context.",
  {},
  async () => {
    const context = await manager.readContext();
    return {
      content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
    };
  }
);

server.tool(
  "update_context",
  "Update the context with partial updates (deep merged).",
  {
    updates: z.string().describe("JSON string of updates to merge"),
  },
  async ({ updates }) => {
    let parsedUpdates;
    try {
      parsedUpdates = JSON.parse(updates);
    } catch (e) {
      return {
        content: [{ type: "text", text: "Error: updates must be valid JSON string" }],
        isError: true
      };
    }

    try {
        const newContext = await manager.updateContext(parsedUpdates);
        return {
          content: [{ type: "text", text: JSON.stringify(newContext, null, 2) }],
        };
    } catch (e: any) {
        return {
            content: [{ type: "text", text: `Error updating context: ${e.message}` }],
            isError: true
        };
    }
  }
);

server.tool(
  "clear_context",
  "Reset the context to empty/default state.",
  {},
  async () => {
    await manager.clearContext();
    return {
      content: [{ type: "text", text: "Context cleared." }],
    };
  }
);

server.tool(
    "sync_brain",
    "Force sync context to Brain episodic memory.",
    {},
    async () => {
        await manager.sync_brain();
        return {
            content: [{ type: "text", text: "Context synced to Brain." }]
        };
    }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Context MCP Server running on stdio");
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().catch((err) => {
    console.error("Fatal error in Context MCP Server:", err);
    process.exit(1);
  });
}
