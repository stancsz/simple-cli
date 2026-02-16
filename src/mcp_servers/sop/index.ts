import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { readdir, readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { SOPEngine } from "../../sop/SOPEngine.js";
import { SopMcpClient } from "../../sop/SopMcpClient.js";

export class SOPServer {
  private server: McpServer;
  private client: SopMcpClient;
  private engine: SOPEngine;
  private sopsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "sop-server",
      version: "1.0.0",
    });

    // Use current working directory as base for resolving paths
    // The engine will look for files relative to this directory.
    // If we pass 'sops/deploy.md', it will look in cwd/sops/deploy.md
    this.sopsDir = process.cwd();
    this.client = new SopMcpClient();
    this.engine = new SOPEngine(this.client, this.sopsDir);

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "list_sops",
      "List all available Standard Operating Procedures (SOPs) in the sops/ directory.",
      {},
      async () => {
        try {
          const sopsDir = join(process.cwd(), "sops");
          if (!existsSync(sopsDir)) {
            return { content: [{ type: "text", text: "No sops/ directory found." }] };
          }
          const files = await readdir(sopsDir);
          const sops = files
            .filter(f => f.endsWith(".md"))
            .map(f => `sops/${f}`); // Return relative paths
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(sops, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error listing SOPs: ${e.message}` }],
          };
        }
      }
    );

    this.server.tool(
      "read_sop",
      "Read and parse an SOP definition.",
      {
        sop_path: z.string().describe("The path to the SOP markdown file (e.g. 'sops/market_research.md')."),
      },
      async ({ sop_path }) => {
        try {
          const sop = await this.engine.loadSOP(sop_path);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(sop, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error reading SOP: ${e.message}` }],
          };
        }
      }
    );

    this.server.tool(
      "execute_sop",
      "Execute an SOP workflow.",
      {
        sop_path: z.string().describe("The path to the SOP markdown file (e.g., 'sops/deploy.md')."),
        params: z.record(z.any()).optional().describe("Optional parameters for the SOP."),
        resume: z.boolean().optional().describe("Whether to resume from the last saved state."),
      },
      async ({ sop_path, params, resume }) => {
        try {
          // Ensure client is initialized and connected to tools
          await this.client.init();

          const result = await this.engine.executeSOP(sop_path, params || {}, resume || false);

          // Log progress to .agent/sop_logs.jsonl
          const agentDir = join(process.cwd(), ".agent");
          if (!existsSync(agentDir)) {
              await mkdir(agentDir, { recursive: true });
          }

          const logPath = join(agentDir, "sop_logs.jsonl");
          const logEntry = {
              sop: sop_path,
              params,
              result,
              timestamp: new Date().toISOString()
          };

          await appendFile(logPath, JSON.stringify(logEntry) + "\n");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (e: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error executing SOP: ${e.message}` }],
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SOP MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SOPServer();
  server.run().catch((err) => {
    console.error("Fatal error in SOP MCP Server:", err);
    process.exit(1);
  });
}
