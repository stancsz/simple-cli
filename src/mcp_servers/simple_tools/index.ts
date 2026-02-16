import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

// TODO: [Ingest] This entire server is a collection of ad-hoc tools (run_command, read_file).
// It simulates standard capabilities but poorly.
// REPLACE this with:
// 1. @modelcontextprotocol/server-filesystem (for read_file/write_file)
// 2. @modelcontextprotocol/server-git (for git ops)
// 3. A dedicated 'Context MCP Server' if needed, or just let the engine handle context.

export class SimpleToolsServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "simple-tools-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
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
        console.warn(
          `[Security Warning] Executing arbitrary command: ${command}`,
        );
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
