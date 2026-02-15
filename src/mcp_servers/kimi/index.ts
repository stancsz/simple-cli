import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export class KimiSwarmServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "kimi-swarm-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "start_kimi_swarm",
      "Start a Kimi K2.5 Agent Swarm to perform a complex task using multiple agents. Uses Moonshot AI's Kimi model.",
      {
        task: z.string().describe("The task description for the swarm to execute."),
      },
      async ({ task }) => {
        return await this.startKimiSwarm(task);
      }
    );
  }

  async startKimiSwarm(task: string) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(
      __dirname,
      "..",
      "..",
      "agents",
      "kimi",
      "swarm.py",
    );

    // Basic python check
    const checkCrew = spawn("python3", ["-c", "import crewai"], {
      stdio: "ignore",
    });
    const crewInstalled = await new Promise<boolean>((resolve) => {
      checkCrew.on("exit", (code) => resolve(code === 0));
    });

    if (!crewInstalled) {
      return {
        content: [
          {
            type: "text",
            text: "Error: 'crewai' python package is not installed. Please install it using `pip install crewai`.",
          },
        ],
      };
    }

    // Set up environment
    const apiKey = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;

    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "Error: MOONSHOT_API_KEY or KIMI_API_KEY environment variable is not set.",
          },
        ],
      };
    }

    const env = {
      ...process.env,
      OPENAI_API_KEY: apiKey,
      OPENAI_BASE_URL:
        process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1",
      OPENAI_MODEL_NAME: process.env.MOONSHOT_MODEL_NAME || "moonshot-v1-8k",
    };

    return new Promise<any>((resolve, reject) => {
      const child = spawn("python3", [scriptPath, task], {
        env,
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
                text: output || "Kimi Swarm execution completed successfully.",
              },
            ],
          });
        } else {
          resolve({
            content: [
              {
                type: "text",
                text: `Kimi Swarm execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
          });
        }
      });

      child.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text",
              text: `Failed to spawn python process: ${err.message}`,
            },
          ],
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Kimi Swarm MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new KimiSwarmServer();
  server.run().catch((err) => {
    console.error("Fatal error in Kimi Swarm MCP Server:", err);
    process.exit(1);
  });
}
