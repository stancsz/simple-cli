import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { CompanyManager } from "../../company_context/manager.js";
import { loadConfig } from "../../config.js";
import { archiveCompanyLogic } from "../../utils/company-management.js";

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

    this.server.tool(
      "get_active_company",
      "Get the currently active company context.",
      {},
      async () => {
        const config = await loadConfig();
        const active = config.active_company || process.env.JULES_COMPANY;
        if (!active) {
            return { content: [{ type: "text", text: "No active company." }] };
        }
        return {
            content: [{ type: "text", text: active }]
        };
      }
    );

    this.server.tool(
      "list_companies",
      "List all available company contexts.",
      {},
      async () => {
        const config = await loadConfig();
        return {
            content: [{ type: "text", text: JSON.stringify({
                active: config.companies || [],
                archived: config.archived_companies || []
            }, null, 2) }]
        };
      }
    );

    this.server.tool(
      "archive_company",
      "Archive a company context, moving it to storage and deactivating it.",
      {
        company_name: z.string().describe("The name of the company to archive."),
      },
      async ({ company_name }) => {
        const config = await loadConfig();
        if (!config.companies?.includes(company_name)) {
            return {
                content: [{ type: "text", text: `Company '${company_name}' not found or already archived.` }],
                isError: true
            };
        }

        try {
            await archiveCompanyLogic(process.cwd(), config, company_name);
            return {
                content: [{ type: "text", text: `Successfully archived company '${company_name}'.` }]
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Failed to archive company: ${e.message}` }],
                isError: true
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
