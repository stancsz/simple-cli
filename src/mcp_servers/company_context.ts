import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";
import { fileURLToPath } from "url";

export class CompanyContextServer {
  private server: McpServer;
  private brainClient: Client | null = null;

  constructor() {
    this.server = new McpServer({
      name: "company-context-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private async getBrain() {
    if (this.brainClient) return this.brainClient;

    const url = process.env.BRAIN_MCP_URL || "http://localhost:3002/sse";
    const transport = new SSEClientTransport(new URL(url));
    const client = new Client(
      { name: "company-context-server", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
        await client.connect(transport);
        this.brainClient = client;
        return client;
    } catch (e) {
        throw new Error(`Failed to connect to Brain MCP server at ${url}. Ensure it is running.`);
    }
  }

  private setupTools() {
    this.server.tool(
      "store_company_memory",
      "Store a memory specific to a company.",
      {
        company: z.string().describe("The company identifier."),
        text: z.string().describe("The memory content."),
        metadata: z.string().optional().describe("Additional JSON metadata."),
      },
      async ({ company, text, metadata }) => {
        const brain = await this.getBrain();
        let metaObj = {};
        if (metadata) {
            try { metaObj = JSON.parse(metadata); } catch {}
        }
        const finalMeta = JSON.stringify({ ...metaObj, company, type: "company_memory" });

        await brain.callTool({
            name: "store_episodic_memory",
            arguments: { text, metadata: finalMeta }
        });

        return { content: [{ type: "text", text: "Company memory stored." }] };
      }
    );

    this.server.tool(
      "query_company_memory",
      "Query memories for a specific company.",
      {
        company: z.string().describe("The company identifier."),
        query: z.string().describe("The search query."),
      },
      async ({ company, query }) => {
        const brain = await this.getBrain();
        // Forward query to brain
        const result: any = await brain.callTool({
            name: "query_episodic_memory",
            arguments: { query, limit: 10 }
        });

        return { content: result.content };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Company Context MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CompanyContextServer();
  server.run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
