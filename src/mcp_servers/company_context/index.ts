import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CompanyContext } from "../../brain/company_context.js";
import { createLLM } from "../../llm.js";
import { fileURLToPath } from "url";

export class CompanyContextServer {
  private server: McpServer;
  private companyContext: CompanyContext | null = null;

  constructor() {
    this.server = new McpServer({
      name: "company-context-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private async getContext(companyId?: string) {
    const targetCompany = companyId || process.env.JULES_COMPANY;

    if (!this.companyContext || (targetCompany && this.companyContext.companyId !== targetCompany)) {
        const llm = createLLM();
        this.companyContext = new CompanyContext(llm, targetCompany);
        await this.companyContext.init();
    }

    return this.companyContext;
  }

  private setupTools() {
    this.server.tool(
      "query_company_memory",
      "Search for relevant information in the company's context memory.",
      {
        query: z.string().describe("The search query."),
        company: z.string().optional().describe("The company ID (optional, defaults to current environment)."),
        limit: z.number().optional().default(5).describe("Number of results to return."),
      },
      async ({ query, company, limit }) => {
        try {
          const ctx = await this.getContext(company);
          const results = await ctx.query(query, limit);
          if (results.length === 0) {
            return {
              content: [{ type: "text", text: "No relevant memory found." }],
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "store_company_memory",
      "Store a document in the company's context memory.",
      {
        text: z.string().describe("The text content to store."),
        metadata: z.record(z.any()).optional().describe("Metadata for the document (JSON object)."),
        company: z.string().optional().describe("The company ID (optional, defaults to current environment)."),
      },
      async ({ text, metadata, company }) => {
        try {
          const ctx = await this.getContext(company);
          await ctx.store(text, metadata || {});
          return {
            content: [{ type: "text", text: "Successfully stored in company memory." }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "list_companies",
      "List all available company contexts.",
      {},
      async () => {
        try {
          const companies = await CompanyContext.listCompanies();
          return {
            content: [{ type: "text", text: companies.join("\n") }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error: ${e.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Company Context MCP Server running on stdio");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new CompanyContextServer();
  server.run().catch((err) => {
    console.error("Fatal error in Company Context MCP Server:", err);
    process.exit(1);
  });
}
