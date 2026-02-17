import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { ContextData, ContextManager as IContextManager } from "../core/context.js";
import { ContextManager } from "../context/ContextManager.js";

// Export ContextServer for backward compatibility if used as a library (e.g. CompanyLoader)
export class ContextServer implements IContextManager {
  private manager: ContextManager;

  constructor(cwd: string = process.cwd()) {
    // Note: When instantiated here, ContextManager will not have an MCP client unless
    // we pass one. In standalone mode, it relies on file fallback.
    // If used within Engine/CompanyLoader, we might want to pass mcp if available,
    // but the constructor signature here doesn't support it yet to avoid breaking changes.
    // Ideally, CompanyLoader should instantiate ContextManager directly with mcp.
    this.manager = new ContextManager(undefined, undefined, cwd);
  }

  async readContext(lockId?: string): Promise<ContextData> {
    return this.manager.readContext(lockId);
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    return this.manager.updateContext(updates, lockId);
  }

  async clearContext(lockId?: string): Promise<void> {
    return this.manager.clearContext(lockId);
  }
}

const server = new McpServer({
  name: "context_server",
  version: "1.0.0",
});

const manager = new ContextServer();

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
