import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { ContextManager } from "../../context_manager.js";

export class ContextServer {
  private server: McpServer;
  private contextManager: ContextManager;

  constructor() {
    this.server = new McpServer({
      name: "context-server",
      version: "1.0.0",
    });

    // Initialize ContextManager relative to process.cwd()
    this.contextManager = new ContextManager(process.cwd());
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "update_context",
      "Update the shared context (goals, constraints, recent changes) for all agents.",
      {
        goal: z.string().optional().describe("Add a new high-level goal."),
        constraint: z.string().optional().describe("Add a new global constraint."),
        change: z.string().optional().describe("Log a recent architectural change or decision."),
      },
      async ({ goal, constraint, change }) => {
        const updates = [];
        if (goal) {
          await this.contextManager.addGoal(goal);
          updates.push(`Added goal: ${goal}`);
        }
        if (constraint) {
          await this.contextManager.addConstraint(constraint);
          updates.push(`Added constraint: ${constraint}`);
        }
        if (change) {
          await this.contextManager.logChange(change);
          updates.push(`Logged change: ${change}`);
        }
        return {
          content: [
            {
              type: "text",
              text: updates.length > 0 ? updates.join("\n") : "No updates made.",
            },
          ],
        };
      }
    );

    this.server.tool(
      "read_context",
      "Read the current shared context summary.",
      {},
      async () => {
        const summary = await this.contextManager.getContextSummary();
        return {
          content: [
            {
              type: "text",
              text: summary || "No context available.",
            },
          ],
        };
      }
    );

    this.server.tool(
      "search_memory",
      "Search long-term memory for relevant information.",
      {
        query: z.string().describe("The search query."),
        limit: z.number().optional().default(5).describe("Number of results to return."),
      },
      async ({ query, limit = 5 }) => {
        const result = await this.contextManager.searchMemory(query, limit);
        return {
          content: [{ type: "text", text: result }],
        };
      }
    );

    this.server.tool(
      "add_memory",
      "Add a piece of information to long-term memory.",
      {
        text: z.string().describe("The information to remember."),
        metadata: z.string().optional().describe("Optional JSON metadata string."),
      },
      async ({ text, metadata }) => {
        let meta = {};
        if (metadata) {
          try {
            meta = JSON.parse(metadata);
          } catch {
            meta = { raw: metadata };
          }
        }
        await this.contextManager.addMemory(text, meta);
        return {
          content: [{ type: "text", text: "Memory added." }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Context MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new ContextServer();
  server.run().catch((err) => {
    console.error("Fatal error in Context MCP Server:", err);
    process.exit(1);
  });
}
