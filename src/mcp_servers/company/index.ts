import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { CompanyManager } from "../../company_context/manager.js";

export class CompanyServer {
  private server: McpServer;
  private manager: CompanyManager | null = null;

  constructor() {
    this.server = new McpServer({
      name: "company-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private async getManager() {
    if (!this.manager) {
      const companyId = process.env.JULES_COMPANY;
      this.manager = new CompanyManager(companyId);
      await this.manager.load();
    }
    return this.manager;
  }

  private setupTools() {
    this.server.tool(
      "company_get_context",
      "Get the current company's context (brand voice, relevant docs) based on a query.",
      {
        query: z.string().optional().describe("Query to find relevant company documents."),
      },
      async ({ query }) => {
        try {
          const manager = await this.getManager();
          const context = await manager.getContext(query || "");
          return {
            content: [{ type: "text", text: context }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error retrieving company context: ${e.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Company MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CompanyServer();
  server.run().catch((err) => {
    console.error("Fatal error in Company MCP Server:", err);
    process.exit(1);
  });
}
