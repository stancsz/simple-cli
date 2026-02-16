import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { readdir } from "fs/promises";
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

    this.sopsDir = join(process.cwd(), ".agent", "sops");
    this.client = new SopMcpClient();
    this.engine = new SOPEngine(this.client, this.sopsDir);

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "list_sops",
      "List all available Standard Operating Procedures (SOPs).",
      {},
      async () => {
        try {
          if (!existsSync(this.sopsDir)) {
            return { content: [{ type: "text", text: "No SOP directory found." }] };
          }
          const files = await readdir(this.sopsDir);
          const sops = files
            .filter(f => f.endsWith(".md"))
            .map(f => f.replace(".md", ""));
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
        name: z.string().describe("The name of the SOP to read (e.g. 'market_research')."),
      },
      async ({ name }) => {
        try {
          const sop = await this.engine.loadSOP(name);
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
        name: z.string().describe("The name of the SOP to execute."),
        params: z.record(z.any()).optional().describe("Optional parameters for the SOP."),
      },
      async ({ name, params }) => {
        try {
          // Ensure client is initialized and connected to tools
          await this.client.init();

          const result = await this.engine.executeSOP(name, params || {});
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
