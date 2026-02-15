import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AgnoServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "agno-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "agno_chat",
      "Chat with an AI agent that maintains persistent memory of the user (preferences, facts, history) across sessions.",
      {
        user_id: z.string().describe("The unique identifier for the user (e.g., email or UUID). Mandatory for memory retrieval."),
        message: z.string().describe("The message to send to the agent."),
        session_id: z.string().optional().describe("Optional session ID to continue a specific conversation context. If omitted, a new session might be created or inferred."),
      },
      async ({ user_id, message, session_id }) => {
        return await this.runChat(user_id, message, session_id);
      }
    );
  }

  async runChat(user_id: string, message: string, session_id?: string) {
    const scriptPath = join(__dirname, "agent.py");
    // Ensure we use python3
    const pythonCmd = "python3";

    const args = [scriptPath, user_id, message];
    if (session_id) {
      args.push(session_id);
    }

    return new Promise<any>((resolve, reject) => {
      const pythonProcess = spawn(pythonCmd, args, {
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
          resolve({
            content: [
              {
                type: "text" as const,
                text: output.trim(),
              },
            ],
          });
        } else {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `Error from Agno Agent (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
            isError: true,
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
          isError: true,
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agno MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new AgnoServer();
  server.run().catch((err) => {
    console.error("Fatal error in Agno MCP Server:", err);
    process.exit(1);
  });
}
