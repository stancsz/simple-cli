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

const PYDANTIC_EXTRACT_TOOL = {
  name: "pydantic_extract",
  description: "Extract structured data from text using a PydanticAI agent with strict schema validation. Ideal for parsing unstructured text into enterprise-grade JSON objects.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The unstructured text to process and extract data from.",
      },
      schema: {
        type: "object",
        description: "A simplified JSON schema defining the fields to extract. Format: { 'field_name': { 'type': 'str|int|float|bool', 'description': '...' } }",
      },
    },
    required: ["prompt"],
  },
};

export class PydanticAIServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "pydanticai-server",
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
      tools: [PYDANTIC_EXTRACT_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "pydantic_extract") {
        const args = request.params.arguments as { prompt: string; schema?: any };
        return await this.runExtraction(args.prompt, args.schema);
      }
      throw new Error(`Tool not found: ${request.params.name}`);
    });
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
