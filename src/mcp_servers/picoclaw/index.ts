import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

export class PicoclawServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "picoclaw-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "picoclaw_agent",
      "Run the Picoclaw agent with a message.",
      {
        message: z.string().describe("The message to send to the Picoclaw agent."),
      },
      async ({ message }) => {
        return await this.runAgent(message);
      }
    );
  }

  async runAgent(message: string) {
    // Attempt to find picoclaw executable
    let picoclawPath = "picoclaw"; // Default to PATH
    const localBin = join(process.cwd(), "node_modules", ".bin", "picoclaw");
    if (existsSync(localBin)) {
      picoclawPath = localBin;
    }

    // console.error(`[Picoclaw] Running agent with message: '${message}'`);

    const cmdArgs = ["agent", "-m", message];

    return new Promise<any>((resolve, reject) => {
      const child = spawn(picoclawPath, cmdArgs, {
        env: process.env,
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
            content: [
              {
                type: "text",
                text: output || `Agent execution completed successfully.`,
              },
            ],
          });
        } else {
          // If picoclaw is not found, we might get a specific error code or message
          if (
            errorOutput.includes("ENOENT") ||
            errorOutput.includes("command not found")
          ) {
            resolve({
              content: [
                {
                  type: "text",
                  text: "Error: Picoclaw CLI not found. Please ensure 'picoclaw' is installed and in your PATH or node_modules.",
                },
              ],
            });
          } else {
            resolve({
              content: [
                {
                  type: "text",
                  text: `Agent execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
                },
              ],
            });
          }
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text",
              text: `Failed to spawn picoclaw: ${err.message}`,
            },
          ],
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Picoclaw MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new PicoclawServer();
  server.run().catch((err) => {
    console.error("Fatal error in Picoclaw MCP Server:", err);
    process.exit(1);
  });
}
