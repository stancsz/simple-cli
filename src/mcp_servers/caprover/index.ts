import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { env: { ...global.process.env } });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
          ),
        );
      } else {
        resolve(stdout + (stderr ? `\nSTDERR: ${stderr}` : ""));
      }
    });

    process.on("error", (err) => {
      reject(err);
    });
  });
}

async function runCaprover(args: string[]) {
  const CAPROVER_URL = process.env.CAPROVER_URL;
  const CAPROVER_PASSWORD = process.env.CAPROVER_PASSWORD;

  if (!CAPROVER_URL || !CAPROVER_PASSWORD) {
    throw new Error(
      "CAPROVER_URL and CAPROVER_PASSWORD environment variables are required",
    );
  }

  const finalArgs = [
    "--yes",
    "caprover",
    ...args,
    "--caproverUrl",
    CAPROVER_URL,
    "--caproverPassword",
    CAPROVER_PASSWORD,
  ];
  return runCommand("npx", finalArgs);
}

const DEPLOY_TOOL: Tool = {
  name: "caprover_deploy",
  description: "Deploy an app to Caprover.",
  inputSchema: {
    type: "object",
    properties: {
      appName: { type: "string", description: "Name of the app to deploy to" },
      branch: {
        type: "string",
        description: "Git branch to deploy (optional)",
      },
      imageName: {
        type: "string",
        description: "Docker image name to deploy (optional)",
      },
    },
    required: ["appName"],
  },
};

const CALL_API_TOOL: Tool = {
  name: "caprover_call_api",
  description: "Call Caprover API via CLI.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", description: "GET or POST" },
      path: {
        type: "string",
        description: "API path (e.g., /user/system/info)",
      },
      data: { type: "string", description: "JSON data string (optional)" },
    },
    required: ["method", "path"],
  },
};

export class CaproverServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "caprover-mcp-server",
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
      tools: [DEPLOY_TOOL, CALL_API_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  async handleCallTool(name: string, args: any) {
    try {
      if (name === "caprover_deploy") {
        const { appName, branch, imageName } = args as any;
        const cmdArgs = ["deploy", "-a", appName];
        if (branch) {
          cmdArgs.push("-b", branch);
        } else if (imageName) {
          cmdArgs.push("-i", imageName);
        } else {
          cmdArgs.push("-d");
        }

        const output = await runCaprover(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      if (name === "caprover_call_api") {
        const { method, path, data } = args as any;
        const cmdArgs = ["api", "-m", method, "-t", path];
        if (data) cmdArgs.push("-d", data);

        const output = await runCaprover(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Caprover MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new CaproverServer().run().catch((error) => {
    console.error("Fatal error in Caprover MCP Server:", error);
    process.exit(1);
  });
}
