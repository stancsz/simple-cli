import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import * as lancedb from "@lancedb/lancedb";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { createLLM } from "../../llm.js";

export class CompanyContextServer {
  private server: McpServer;
  private llm: ReturnType<typeof createLLM>;
  private dbPath: string;

  constructor() {
    this.server = new McpServer({
      name: "company_context",
      version: "1.0.0",
    });
    this.llm = createLLM();
    // Reuse existing Brain DB path
    this.dbPath = process.env.BRAIN_STORAGE_ROOT || join(process.cwd(), ".agent", "brain", "episodic");
    this.setupTools();
  }

  private async getDb() {
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
    return await lancedb.connect(this.dbPath);
  }

  private async getTable(db: lancedb.Connection, tableName: string) {
    try {
      const names = await db.tableNames();
      if (names.includes(tableName)) {
        return await db.openTable(tableName);
      }
      return null;
    } catch {
      return null;
    }
  }

  private setupTools() {
    this.server.tool(
      "store_company_document",
      "Ingest a document into the company's knowledge base.",
      {
        company_name: z.string().describe("The name of the company (e.g., 'client-a')."),
        document_path: z.string().describe("The path to the document file."),
      },
      async ({ company_name, document_path }) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(company_name)) {
             return {
                content: [{ type: "text", text: "Invalid company name." }],
                isError: true
             };
        }

        const tableName = `company_${company_name}`;
        const db = await this.getDb();
        let table = await this.getTable(db, tableName);

        try {
            const content = await readFile(document_path, "utf-8");
            const embedding = await this.llm.embed(content);

            if (!embedding) {
                return { content: [{ type: "text", text: `Failed to embed ${document_path}` }], isError: true };
            }

            const data = {
                id: document_path,
                content,
                source: document_path,
                vector: embedding,
                timestamp: Date.now()
            };

            if (!table) {
                table = await db.createTable(tableName, [data]);
            } else {
                await table.add([data]);
            }

            return {
                content: [{ type: "text", text: `Successfully stored document for ${company_name}.` }],
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Error storing document: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "load_company_context",
      "Load the company's core context (profile, onboarding) as a string.",
      {
        company_name: z.string().describe("The name of the company."),
      },
      async ({ company_name }) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(company_name)) {
             return { content: [{ type: "text", text: "Invalid company name." }], isError: true };
        }

        const tableName = `company_${company_name}`;
        const db = await this.getDb();
        const table = await this.getTable(db, tableName);

        if (!table) {
             return { content: [{ type: "text", text: "No context found for this company." }] };
        }

        // Search for "profile" or "onboarding" or "overview"
        const query = "company profile onboarding brand voice overview";
        const embedding = await this.llm.embed(query);
        if (!embedding) return { content: [{ type: "text", text: "Failed to generate embedding." }], isError: true };

        try {
            const results = await table.search(embedding).limit(5).toArray();
             const text = results.map((r: any) => `[Source: ${r.source}]\n${r.content}`).join("\n\n---\n\n");
             return {
                 content: [{ type: "text", text: text || "No relevant context found." }]
             };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error loading context: ${e.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "query_company_memory",
      "Query the company's knowledge base using RAG.",
      {
        company_name: z.string().describe("The name of the company."),
        query: z.string().describe("The search query."),
      },
      async ({ company_name, query }) => {
         if (!/^[a-zA-Z0-9_-]+$/.test(company_name)) {
             return { content: [{ type: "text", text: "Invalid company name." }], isError: true };
        }

        const tableName = `company_${company_name}`;
        const db = await this.getDb();
        const table = await this.getTable(db, tableName);

        if (!table) {
             return { content: [{ type: "text", text: "No context found for this company." }] };
        }

        const embedding = await this.llm.embed(query);
        if (!embedding) return { content: [{ type: "text", text: "Failed to generate embedding." }], isError: true };

        try {
            const results = await table.search(embedding).limit(3).toArray();
             const text = results.map((r: any) => `[Source: ${r.source}]\n${r.content}`).join("\n\n---\n\n");
             return {
                 content: [{ type: "text", text: text || "No relevant documents found." }]
             };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error querying memory: ${e.message}` }], isError: true };
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

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CompanyContextServer();
  server.run().catch((err) => {
    console.error("Fatal error in Company Context MCP Server:", err);
    process.exit(1);
  });
}
