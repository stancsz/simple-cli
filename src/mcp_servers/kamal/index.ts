import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

export class KamalServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "kamal-mcp-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "kamal_setup",
      "Run kamal setup.",
      {
        configFile: z.string().optional().describe("Path to config file (optional)"),
      },
      async ({ configFile }) => {
        const cmdArgs = ["setup"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }
    );

    this.server.tool(
      "kamal_deploy",
      "Run kamal deploy.",
      {
        configFile: z.string().optional().describe("Path to config file (optional)"),
      },
      async ({ configFile }) => {
        const cmdArgs = ["deploy"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }
    );

    this.server.tool(
      "kamal_rollback",
      "Rollback to a specific version.",
      {
        version: z.string().describe("Version to rollback to"),
        configFile: z.string().optional().describe("Path to config file (optional)"),
      },
      async ({ version, configFile }) => {
        const cmdArgs = ["rollback", version];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }
    );

    this.server.tool(
      "kamal_logs",
      "View app logs.",
      {
        configFile: z.string().optional().describe("Path to config file (optional)"),
        lines: z.number().int().optional().describe("Number of lines (optional)"),
      },
      async ({ configFile, lines }) => {
        const cmdArgs = ["app", "logs"];
        if (configFile) cmdArgs.push("-c", configFile);
        const output = await runCommand("kamal", cmdArgs);
        return { content: [{ type: "text", text: output }] };
      }
    );
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
