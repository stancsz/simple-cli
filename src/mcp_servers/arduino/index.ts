import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile, exec } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const server = new McpServer({
  name: "arduino-mcp",
  version: "1.0.0",
});

// Check if arduino-cli is installed
let hasArduinoCli = false;
exec("arduino-cli version", (error) => {
  if (!error) hasArduinoCli = true;
});

server.tool(
  "compile_sketch",
  "Compile an Arduino sketch.",
  {
    sketch_path: z.string().describe("Path to the sketch folder or .ino file"),
    fqbn: z.string().describe("Fully Qualified Board Name (e.g., arduino:avr:uno)"),
  },
  async ({ sketch_path, fqbn }) => {
    if (!hasArduinoCli) {
      return {
        content: [
          {
            type: "text",
            text: `[Mock] Compiled sketch at ${sketch_path} for board ${fqbn}. (arduino-cli not found)`,
          },
        ],
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync("arduino-cli", ["compile", "--fqbn", fqbn, sketch_path]);
      return {
        content: [
          {
            type: "text",
            text: stdout || stderr,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Compilation failed: ${error.message}\n${error.stderr}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "upload_sketch",
  "Upload a compiled sketch to an Arduino board.",
  {
    sketch_path: z.string().describe("Path to the sketch folder or .ino file"),
    port: z.string().describe("Serial port (e.g., /dev/ttyACM0 or COM3)"),
    fqbn: z.string().describe("Fully Qualified Board Name (e.g., arduino:avr:uno)"),
  },
  async ({ sketch_path, port, fqbn }) => {
    if (!hasArduinoCli) {
      return {
        content: [
          {
            type: "text",
            text: `[Mock] Uploaded sketch at ${sketch_path} to ${port} for board ${fqbn}. (arduino-cli not found)`,
          },
        ],
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync("arduino-cli", ["upload", "-p", port, "--fqbn", fqbn, sketch_path]);
      return {
        content: [
          {
            type: "text",
            text: stdout || stderr,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Upload failed: ${error.message}\n${error.stderr}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "list_boards",
  "List connected Arduino boards.",
  {},
  async () => {
    if (!hasArduinoCli) {
        return {
            content: [{ type: "text", text: "[Mock] No boards connected (arduino-cli not found). Mock: arduino:avr:uno on /dev/ttyACM0" }]
        };
    }

    try {
        const { stdout } = await execFileAsync("arduino-cli", ["board", "list"]);
        return {
            content: [{ type: "text", text: stdout }]
        };
    } catch (error: any) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to list boards: ${error.message}` }]
        };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Arduino MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
