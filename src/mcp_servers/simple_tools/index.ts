import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { ContextManager } from "../../context_manager.js";

const execAsync = promisify(exec);

// TODO: [Ingest] This entire server is a collection of ad-hoc tools (run_command, read_file).
// It simulates standard capabilities but poorly.
// REPLACE this with:
// 1. @modelcontextprotocol/server-filesystem (for read_file/write_file)
// 2. @modelcontextprotocol/server-git (for git ops)
// 3. A dedicated 'Context MCP Server' if needed, or just let the engine handle context.

export class SimpleToolsServer {
  private server: McpServer;
  private contextManager: ContextManager;

  constructor(contextManager?: ContextManager) {
    this.server = new McpServer({
      name: "simple-tools-server",
      version: "1.0.0",
    });

    // Initialize ContextManager relative to process.cwd()
    this.contextManager = contextManager || new ContextManager(process.cwd());
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
      "read_file",
      "Read the content of a file.",
      {
        path: z.string().describe("The path of the file to read."),
      },
      async ({ path }) => {
        const content = await readFile(path, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }
    );

    this.server.tool(
      "write_file",
      "Write content to a file.",
      {
        path: z.string().describe("The path of the file to write."),
        content: z.string().describe("The content to write."),
      },
      async ({ path, content }) => {
        await writeFile(path, content);
        return {
          content: [{ type: "text", text: `Successfully wrote to ${path}` }],
        };
      }
    );

    this.server.tool(
      "run_command",
      // TODO: [Security] Arbitrary command execution is dangerous.
      // If needed, use a sandboxed shell MCP server or separate 'Terminal MCP'.
      "Execute a shell command.",
      {
        command: z.string().describe("The command to execute."),
      },
      async ({ command }) => {
        const { stdout, stderr } = await execAsync(command);
        return {
          content: [
            {
              type: "text",
              text: stdout + (stderr ? `\nStderr: ${stderr}` : ""),
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
      },
      async ({ query }) => {
        const result = await this.contextManager.searchMemory(query);
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

  async handleCallTool(name: string, args: any) {
    const mcpServer = this.server as any;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Simple Tools MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SimpleToolsServer();
  server.run().catch((err) => {
    console.error("Fatal error in Simple Tools MCP Server:", err);
    process.exit(1);
  });
}
