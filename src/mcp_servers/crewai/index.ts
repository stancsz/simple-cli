import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";

export class CrewAIServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "crewai-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "start_crew",
      "Start a CrewAI crew to perform a complex task using multiple agents.",
      {
        task: z.string().describe("The task description for the crew to execute."),
      },
      async ({ task }) => {
        return await this.startCrew(task);
      }
    );
  }

  async startCrew(task: string) {
    const scriptPath = join(
      process.cwd(),
      "src",
      "agents",
      "crewai",
      "generic_crew.py",
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
        isError: true,
      };
    }

    // Set up environment
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const env = {
      ...process.env,
      OPENAI_API_KEY: apiKey,
      ...(process.env.DEEPSEEK_API_KEY
        ? {
            OPENAI_BASE_URL: "https://api.deepseek.com",
            OPENAI_MODEL_NAME: "deepseek-chat",
          }
        : {}),
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
                text: output || "Crew execution completed successfully.",
              },
            ],
          });
        } else {
          resolve({
            content: [
              {
                type: "text",
                text: `Crew execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
            isError: true,
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
          isError: true,
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CrewAI MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CrewAIServer();
  server.run().catch((err) => {
    console.error("Fatal error in CrewAI MCP Server:", err);
    process.exit(1);
  });
}
