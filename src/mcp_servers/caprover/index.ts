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

async function runCaprover(args: string[]) {
  const CAPROVER_URL = process.env.CAPROVER_URL;
  const CAPROVER_PASSWORD = process.env.CAPROVER_PASSWORD;

  if (!CAPROVER_URL || !CAPROVER_PASSWORD) {
    throw new Error(
      "CAPROVER_URL and CAPROVER_PASSWORD environment variables are required",
    );
  }

  // We are running 'npx caprover ...'
  // The args passed to this function are the arguments for caprover cli
  const finalArgs = [
    "caprover",
    ...args,
    "--caproverUrl",
    CAPROVER_URL,
    "--caproverPassword",
    CAPROVER_PASSWORD,
  ];

  return runCommand("npx", ["--yes", ...finalArgs]);
}

export class CaproverServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "caprover-mcp-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "caprover_deploy",
      "Deploy an app to Caprover.",
      {
        appName: z.string().describe("Name of the app to deploy to"),
        branch: z.string().optional().describe("Git branch to deploy (optional)"),
        imageName: z.string().optional().describe("Docker image name to deploy (optional)"),
      },
      async ({ appName, branch, imageName }) => {
        const cmdArgs = ["deploy", "-a", appName];
        if (branch) {
          cmdArgs.push("-b", branch);
        } else if (imageName) {
          cmdArgs.push("-i", imageName);
        } else {
          cmdArgs.push("-d"); // Default to deploy from current directory
        }

        const output = await runCaprover(cmdArgs);
        return {
          content: [{ type: "text" as const, text: output }],
        };
      }
    );

    this.server.tool(
      "caprover_call_api",
      "Call Caprover API via CLI.",
      {
        method: z.string().describe("GET or POST"),
        path: z.string().describe("API path (e.g., /user/system/info)"),
        data: z.string().optional().describe("JSON data string (optional)"),
      },
      async ({ method, path, data }) => {
        const cmdArgs = ["api", "-m", method, "-t", path];
        if (data) cmdArgs.push("-d", data);

        const output = await runCaprover(cmdArgs);
        return {
          content: [{ type: "text" as const, text: output }],
        };
      }
    );
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
