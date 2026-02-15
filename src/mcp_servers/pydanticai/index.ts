import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PydanticAIServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "pydanticai-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "pydantic_extract",
      "Extract structured data from text using a PydanticAI agent with strict schema validation. Ideal for parsing unstructured text into enterprise-grade JSON objects.",
      {
        prompt: z.string().describe("The unstructured text to process and extract data from."),
        schema: z.record(z.any()).optional().describe("A simplified JSON schema defining the fields to extract. Format: { 'field_name': { 'type': 'str|int|float|bool', 'description': '...' } }"),
      },
      async ({ prompt, schema }) => {
        return await this.runExtraction(prompt, schema);
      }
    );
  }

  async runExtraction(prompt: string, schema?: any) {
    const scriptPath = join(__dirname, "agent.py");
    // Ensure we use the same python environment, or try generic python3
    const pythonCmd = "python3";

    const args = [scriptPath, prompt];
    if (schema) {
      args.push(JSON.stringify(schema));
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
          // Attempt to parse output as JSON just to be clean, or return raw string
          // Since the python script outputs JSON, we can return it as text.
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
                text: `Error extracting data (exit code ${code}):\n${errorOutput}\n${output}`,
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
    console.error("PydanticAI MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new PydanticAIServer();
  server.run().catch((err) => {
    console.error("Fatal error in PydanticAI MCP Server:", err);
    process.exit(1);
  });
}
