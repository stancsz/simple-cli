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

const SETUP_TOOL: Tool = {
  name: "kamal_setup",
  description: "Run kamal setup.",
  inputSchema: {
    type: "object",
    properties: {
      configFile: {
        type: "string",
        description: "Path to config file (optional)",
      },
    },
  },
};

const DEPLOY_TOOL: Tool = {
  name: "kamal_deploy",
  description: "Run kamal deploy.",
  inputSchema: {
    type: "object",
    properties: {
      configFile: {
        type: "string",
        description: "Path to config file (optional)",
      },
    },
  },
};

const ROLLBACK_TOOL: Tool = {
  name: "kamal_rollback",
  description: "Rollback to a specific version.",
  inputSchema: {
    type: "object",
    properties: {
      version: { type: "string", description: "Version to rollback to" },
      configFile: {
        type: "string",
        description: "Path to config file (optional)",
      },
    },
    required: ["version"],
  },
};

const LOGS_TOOL: Tool = {
  name: "kamal_logs",
  description: "View app logs.",
  inputSchema: {
    type: "object",
    properties: {
      configFile: {
        type: "string",
        description: "Path to config file (optional)",
      },
      lines: { type: "number", description: "Number of lines (optional)" },
    },
  },
};

export class KamalServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "kamal-mcp-server",
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
      tools: [SETUP_TOOL, DEPLOY_TOOL, ROLLBACK_TOOL, LOGS_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  async handleCallTool(name: string, args: any) {
    try {
      if (name === "kamal_setup") {
        const { configFile } = args as any;
        const cmdArgs = ["setup"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }

      if (name === "kamal_deploy") {
        const { configFile } = args as any;
        const cmdArgs = ["deploy"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }

      if (name === "kamal_rollback") {
        const { version, configFile } = args as any;
        const cmdArgs = ["rollback", version];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }

      if (name === "kamal_logs") {
        const { configFile, lines } = args as any;
        const cmdArgs = ["app", "logs"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
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
    console.error("Kamal MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new KamalServer().run().catch((error) => {
    console.error("Fatal error in Kamal MCP Server:", error);
    process.exit(1);
  });
}
