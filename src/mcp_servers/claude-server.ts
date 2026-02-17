import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import process from "process";
import { readFile } from "fs/promises";
import { join } from "path";

export class ClaudeServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "claude-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "claude_code",
      "Ask Claude to perform a task or answer a question.",
      {
        task: z.string().describe("The task or question for Claude."),
        context_files: z.array(z.string()).optional().describe("List of file paths to provide as context."),
      },
      async ({ task, context_files }) => {
        const result = await this.runClaude(task, context_files || []);
        return {
          content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          isError: result.isError,
        };
      }
    );
  }

  private async runClaude(task: string, files: string[]) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: DEEPSEEK_API_KEY environment variable is not set." }],
        isError: true,
      };
    }

    let finalTask = task;
    const soulPath = join(process.cwd(), "src", "agents", "souls", "claude.md");
    try {
      const soul = await readFile(soulPath, "utf-8");
      finalTask = `${soul}\n\nTask:\n${task}`;
    } catch (e) {
      // console.warn("Could not load Claude soul:", e);
    }

    // Construct arguments for claude code
    const args = ["@anthropic-ai/claude-code"];

    if (files && files.length > 0) {
      for (const file of files) {
        args.push("--file", file);
      }
    }

    args.push(finalTask);

    return new Promise<{ content: { type: "text", text: string }[], isError?: boolean }>((resolve) => {
      // console.error(`[Claude] Running: npx ${args.join(" ")}`);

      const env = {
        ...process.env,
        // Configure DeepSeek as per documentation
        ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_AUTH_TOKEN: apiKey, // Some docs suggest this too
        ANTHROPIC_MODEL: "deepseek-chat",
        ANTHROPIC_SMALL_FAST_MODEL: "deepseek-chat",
        // Optional timeouts
        API_TIMEOUT_MS: "600000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      };

      const child = spawn("npx", args, {
        env: env,
        shell: false,
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({
            content: [{ type: "text", text: output + (errorOutput ? `\nStderr:\n${errorOutput}` : "") }],
          });
        } else {
          resolve({
            content: [{ type: "text", text: `Claude failed with exit code ${code}.\nStdout:\n${output}\nStderr:\n${errorOutput}` }],
            isError: true,
          });
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [{ type: "text", text: `Failed to start claude: ${err.message}` }],
          isError: true,
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Claude MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new ClaudeServer();
  server.run().catch((err) => {
    console.error("Fatal error in Claude MCP Server:", err);
    process.exit(1);
  });
}
