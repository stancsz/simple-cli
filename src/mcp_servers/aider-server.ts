import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import process from "process";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export class AiderServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "aider-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "aider_chat",
      "Chat with Aider about your code or ask it to make edits.",
      {
        message: z.string().describe("The message or instruction for Aider."),
        files: z.array(z.string()).optional().describe("List of file paths to include in the context."),
      },
      async ({ message, files }) => {
        const result = await this.runAider(message, files || []);
        return {
          content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          isError: result.isError,
        };
      }
    );

    this.server.tool(
      "aider_edit",
      "Instruct Aider to edit specific files based on a request.",
      {
        task: z.string().describe("The instruction describing the changes to make."),
        context_files: z.array(z.string()).describe("List of file paths to edit."),
      },
      async ({ task, context_files }) => {
        const result = await this.runAider(task, context_files);
        return {
          content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          isError: result.isError,
        };
      }
    );
  }

  private async runAider(message: string, files: string[]) {
    // Check if aider is installed
    try {
      const check = spawn("aider", ["--version"]);
      await new Promise((resolve, reject) => {
        check.on("error", reject);
        check.on("close", (code) => {
          if (code === 0) resolve(true);
          else reject(new Error(`Exit code ${code}`));
        });
      });
    } catch (e) {
      return {
        content: [{ type: "text", text: "Error: 'aider' CLI is not found. Please install it (e.g., `pip install aider-chat`)." }],
        isError: true
      };
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: DEEPSEEK_API_KEY environment variable is not set." }],
        isError: true,
      };
    }

    let finalMessage = message;
    const soulPath = join(process.cwd(), "src", "agents", "souls", "aider.md");
    try {
      if (existsSync(soulPath)) {
        const soul = await readFile(soulPath, "utf-8");
        finalMessage = `${soul}\n\nTask:\n${message}`;
      }
    } catch (e) {
      // Ignore soul loading error
    }

    // Construct arguments
    const args = [
      "--model", "deepseek/deepseek-reasoner",
      "--api-key", `deepseek=${apiKey}`,
      "--yes", // Automatically confirm changes
      "--message", finalMessage,
      ...files
    ];

    return new Promise<{ content: { type: "text", text: string }[], isError?: boolean }>((resolve) => {
      // console.error(`[Aider] Running: aider ${args.join(" ")}`);

      const child = spawn("aider", args, {
        env: { ...process.env, DEEPSEEK_API_KEY: apiKey },
        shell: false
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      // Ensure aider exits after the message
      // Writing /exit might be needed if it stays in chat mode
      if (child.stdin) {
        child.stdin.write("/exit\n");
        child.stdin.end();
      }

      child.on("close", (code) => {
        if (code === 0) {
          resolve({
            content: [{ type: "text", text: output + (errorOutput ? `\nStderr:\n${errorOutput}` : "") }],
          });
        } else {
          resolve({
            content: [{ type: "text", text: `Aider failed with exit code ${code}.\nStdout:\n${output}\nStderr:\n${errorOutput}` }],
            isError: true,
          });
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [{ type: "text", text: `Failed to start aider: ${err.message}` }],
          isError: true,
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Aider MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new AiderServer();
  server.run().catch((err) => {
    console.error("Fatal error in Aider MCP Server:", err);
    process.exit(1);
  });
}
