import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AutoGenServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "autogen-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "run_autogen_conversation",
      "Start a conversation between two AutoGen agents (Assistant and UserProxy) to solve a task.",
      {
        task: z.string().describe("The task or question for the agents to solve."),
      },
      async ({ task }) => {
        return await this.runConversation(task);
      }
    );
  }

  async runConversation(task: string) {
    const scriptPath = join(__dirname, "agent.py");

    // Check dependencies
    const checkDeps = spawn("python3", ["-c", "import autogen"], {
      stdio: "ignore",
    });

    const depsInstalled = await new Promise<boolean>((resolve) => {
      checkDeps.on("exit", (code) => resolve(code === 0));
      checkDeps.on("error", () => resolve(false));
    });

    if (!depsInstalled) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Python dependency 'pyautogen' is not installed. Please install it using `pip install pyautogen`.",
          },
        ],
      };
    }

    return new Promise<any>((resolve, reject) => {
      const pythonProcess = spawn("python3", [scriptPath, task], {
        env: process.env,
      });

      let output = "";
      let errorOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
             const jsonOutput = JSON.parse(output.trim());
             if (jsonOutput.error) {
                 resolve({
                     content: [{ type: "text" as const, text: `AutoGen Error: ${jsonOutput.error}` }]
                 });
             } else {
                 resolve({
                     content: [
                         { type: "text" as const, text: `Result:\n${jsonOutput.result}` },
                         { type: "text" as const, text: `\nFull Conversation:\n${jsonOutput.conversation}` }
                     ]
                 });
             }
          } catch (e) {
             resolve({
                 content: [{ type: "text" as const, text: output.trim() }]
             });
          }
        } else {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `AutoGen execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
          });
        }
      });

      pythonProcess.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text" as const,
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
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("AutoGen MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new AutoGenServer();
  server.run().catch((err) => {
    console.error("Fatal error in AutoGen MCP Server:", err);
    process.exit(1);
  });
}
