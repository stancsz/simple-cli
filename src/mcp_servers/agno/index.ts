import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGNO_CHAT_TOOL = {
  name: "agno_chat",
  description: "Chat with an AI agent that maintains persistent memory of the user (preferences, facts, history) across sessions.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The unique identifier for the user (e.g., email or UUID). Mandatory for memory retrieval.",
      },
      message: {
        type: "string",
        description: "The message to send to the agent.",
      },
      session_id: {
        type: "string",
        description: "Optional session ID to continue a specific conversation context. If omitted, a new session might be created or inferred.",
      },
    },
    required: ["user_id", "message"],
  },
};

export class AgnoServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "agno-server",
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
      tools: [AGNO_CHAT_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "agno_chat") {
        const args = request.params.arguments as { user_id: string; message: string; session_id?: string };
        return await this.runChat(args.user_id, args.message, args.session_id);
      }
      throw new Error(`Tool not found: ${request.params.name}`);
    });
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
                type: "text",
                text: output.trim(),
              },
            ],
          });
        } else {
          resolve({
            content: [
              {
                type: "text",
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
