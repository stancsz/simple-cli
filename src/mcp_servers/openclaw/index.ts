import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const OpenClawRunSchema = z.object({
  skill: z
    .string()
    .describe("The name of the skill to run (e.g., 'weather', 'github')."),
  args: z.record(z.any()).optional().describe("Arguments for the skill."),
});

export const OPENCLAW_RUN_TOOL = {
  name: "openclaw_run",
  description: "Run an OpenClaw skill (e.g., weather, github, etc.)",
  inputSchema: {
    type: "object",
    properties: {
      skill: {
        type: "string",
        description:
          "The name of the skill to run (e.g., 'weather', 'github').",
      },
      args: {
        type: "object",
        description: "Arguments for the skill.",
        additionalProperties: true,
      },
    },
    required: ["skill"],
  },
};

export class OpenClawServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "openclaw-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [OPENCLAW_RUN_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  public async handleCallTool(name: string, args: any) {
    if (name === "openclaw_run") {
      const parsed = OpenClawRunSchema.safeParse(args);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
      }
      const { skill, args: skillArgs } = parsed.data;
      try {
        return await this.runSkill(skill, skillArgs || {});
      } catch (e: any) {
        throw new McpError(
          ErrorCode.InternalError,
          `Skill execution failed: ${e.message}`,
        );
      }
    }
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
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
                type: "text",
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
                  type: "text",
                  text: "Error: OpenClaw CLI not found. Please ensure 'openclaw' is installed and in your PATH or node_modules.",
                },
              ],
              isError: true,
            });
          } else {
            resolve({
              content: [
                {
                  type: "text",
                  text: `Skill execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
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
              type: "text",
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
