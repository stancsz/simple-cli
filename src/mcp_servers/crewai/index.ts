import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { BrainClient } from "../../brain/client.js";

export class CrewAIServer {
  private server: McpServer;
  private brain: BrainClient;

  constructor() {
    this.server = new McpServer({
      name: "crewai-server",
      version: "1.0.0",
    });

    // Initialize BrainClient (will self-manage connection if standalone)
    this.brain = new BrainClient();

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
      };
    }

    // Query Brain for past experiences
    let memoryContext = "";
    try {
        const company = process.env.JULES_COMPANY;
        const memory = await this.brain.query(task, company);
        if (memory && !memory.includes("No relevant memories found")) {
            memoryContext = `[Relevant Past Experience]\n${memory}\n\n`;
        }
    } catch (e) {
        // Ignore brain errors
    }

    let finalTask = task;
    const soulPath = join(process.cwd(), "src", "agents", "souls", "crewai.md");
    try {
      const soul = await readFile(soulPath, "utf-8");
      finalTask = `${soul}\n\n${memoryContext}Task:\n${task}`;
    } catch (e) {
      finalTask = `${memoryContext}Task:\n${task}`;
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
      const child = spawn("python3", [scriptPath, finalTask], {
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

      child.on("close", async (code) => {
        const fullOutput = output + (errorOutput ? `\nStderr:\n${errorOutput}` : "");

        if (code === 0) {
          // Store successful execution in Brain
          try {
             const company = process.env.JULES_COMPANY;
             await this.brain.store(
                 `crewai-${Date.now()}`,
                 task,
                 output || "Task completed successfully.",
                 [],
                 company
             );
          } catch (e) {
             // Ignore store errors
          }

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
                text: `Crew execution failed (exit code ${code}):\n${fullOutput}`,
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

  async handleCallTool(name: string, args: any) {
    const mcpServer = this.server as any;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  }

  async run() {
    // Connect to Brain server (if running standalone)
    await this.brain.connect();

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
