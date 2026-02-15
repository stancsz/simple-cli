import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

export class OpenClawServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "openclaw-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "openclaw_run",
      "Run an OpenClaw skill (e.g., weather, github, etc.)",
      {
        skill: z.string().describe("The name of the skill to run (e.g., 'weather', 'github')."),
        args: z.record(z.any()).optional().describe("Arguments for the skill."),
      },
      async ({ skill, args }) => {
        return await this.runSkill(skill, args || {});
      }
    );
  }

  async runSkill(skill: string, args: Record<string, any>) {
    // Attempt to find openclaw executable
    let openclawPath = "openclaw"; // Default to PATH
    const localBin = join(process.cwd(), "node_modules", ".bin", "openclaw");
    if (existsSync(localBin)) {
      openclawPath = localBin;
    }

    console.error(`[OpenClaw] Running skill '${skill}'...`);

    // Construct arguments
    // Assuming generic CLI structure: openclaw run <skill> --arg1 val1 --arg2 val2
    const cmdArgs = ["run", skill];
    for (const [key, value] of Object.entries(args)) {
      cmdArgs.push(`--${key}`);
      if (value !== true) {
        // If not a boolean flag, add value
        cmdArgs.push(String(value));
      }
    }

    return new Promise<any>((resolve, reject) => {
      const child = spawn(openclawPath, cmdArgs, {
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
                type: "text" as const,
                text: output || `Skill '${skill}' completed successfully.`,
              },
            ],
          });
        } else {
          // If openclaw is not found, we might get a specific error code or message
          if (
            errorOutput.includes("ENOENT") ||
            errorOutput.includes("command not found")
          ) {
            resolve({
              content: [
                {
                  type: "text" as const,
                  text: "Error: OpenClaw CLI not found. Please ensure 'openclaw' is installed and in your PATH or node_modules.",
                },
              ],
              isError: true,
            });
          } else {
             // General failure
             resolve({
              content: [
                {
                  type: "text" as const,
                  text: `Skill execution failed (code ${code}):\n${errorOutput}\n${output}`,
                },
              ],
              isError: true,
            });
          }
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text" as const,
              text: `Failed to spawn openclaw: ${err.message}`,
            },
          ],
          isError: true,
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenClaw MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new OpenClawServer();
  server.run().catch((err) => {
    console.error("Fatal error in OpenClaw MCP Server:", err);
    process.exit(1);
  });
}
