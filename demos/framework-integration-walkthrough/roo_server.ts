import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import process from "process";

// Create the server instance
const server = new McpServer({
  name: "roo-code-integration",
  version: "1.0.0",
});

// Path to our mock CLI (in a real scenario, this would be 'roo' in the PATH)
// For the tutorial, we point to the mock script in demos/
const MOCK_CLI_PATH = join(process.cwd(), "demos", "framework-integration-walkthrough", "mock-roo-cli.ts");

// Helper function to run the CLI
async function runRooCommand(command: string, file: string): Promise<string> {
   return new Promise((resolve, reject) => {
     // We use 'npx tsx' to run the typescript mock directly
     const child = spawn("npx", ["tsx", MOCK_CLI_PATH, command, file], {
       env: process.env,
     });

     let stdout = "";
     let stderr = "";

     child.stdout.on("data", (data) => stdout += data);
     child.stderr.on("data", (data) => stderr += data);

     child.on("close", (code) => {
       if (code === 0) {
         resolve(stdout.trim());
       } else {
         resolve(`Error (Exit Code ${code}): ${stderr}`);
       }
     });
   });
}

// Define the 'roo_analyze' tool
server.tool(
  "roo_analyze",
  "Analyze a file using Roo Code's advanced reasoning engine.",
  {
    file_path: z.string().describe("The path to the file to analyze"),
  },
  async ({ file_path }) => {
    const output = await runRooCommand("analyze", file_path);
    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// Define the 'roo_fix' tool
server.tool(
  "roo_fix",
  "Apply automated fixes to a file using Roo Code.",
  {
    file_path: z.string().describe("The path to the file to fix"),
  },
  async ({ file_path }) => {
    const output = await runRooCommand("fix", file_path);
    return {
      content: [{ type: "text", text: output }],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roo Code MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
