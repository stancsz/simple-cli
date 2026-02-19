import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import * as lancedb from "@lancedb/lancedb";
import { join } from "path";
import { readFile, readdir, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { createLLM } from "../../llm.js";

export class CompanyContextServer {
  private server: McpServer;
  private llm: ReturnType<typeof createLLM>;
  private connectionPool: Map<string, lancedb.Connection> = new Map();
  private activeCompanyId: string | null = null;

  constructor() {
    this.server = new McpServer({
      name: "company_context",
      version: "1.0.0",
    });
    this.llm = createLLM();
    this.setupTools();
  }

  private async getDb(companyId: string) {
    if (this.connectionPool.has(companyId)) {
        return this.connectionPool.get(companyId)!;
    }

    const dbPath = join(process.cwd(), ".agent", "companies", companyId, "brain");
    if (!existsSync(dbPath)) {
      await mkdir(dbPath, { recursive: true });
    }

    try {
        const db = await lancedb.connect(dbPath);
        this.connectionPool.set(companyId, db);
        return db;
    } catch (e) {
        console.error(`Failed to connect to DB for company ${companyId}:`, e);
        throw e;
    }
  }

  private async getTable(db: lancedb.Connection, tableName: string = "documents") {
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
      "switch_company_context",
      "Switch the active company context to the specified company ID.",
      {
        company_id: z.string().describe("The ID of the company to switch to."),
      },
      async ({ company_id }) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(company_id)) {
             return {
                content: [{ type: "text", text: "Invalid company ID." }],
                isError: true
             };
        }

        const companyDir = join(process.cwd(), ".agent", "companies", company_id);
        if (!existsSync(companyDir)) {
             return {
                content: [{ type: "text", text: `Company directory not found: ${companyDir}` }],
                isError: true
             };
        }

        // Initialize/verify connection
        try {
            await this.getDb(company_id);
            this.activeCompanyId = company_id;
            return {
                content: [{ type: "text", text: `Successfully switched context to company: ${company_id}` }]
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Failed to switch context: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "load_company_context",
      "Ingest documents from the company's docs directory into the vector database.",
      {
        company_id: z.string().describe("The ID of the company (e.g., 'client-a')."),
      },
      async ({ company_id }) => {
        // Validate company ID to prevent path traversal
        if (!/^[a-zA-Z0-9_-]+$/.test(company_id)) {
             return {
                content: [{ type: "text", text: "Invalid company ID." }],
                isError: true
             };
        }

        const docsDir = join(process.cwd(), ".agent", "companies", company_id, "docs");
        if (!existsSync(docsDir)) {
          return {
            content: [{ type: "text", text: `Directory not found: ${docsDir}` }],
            isError: true,
          };
        }

        const files = await readdir(docsDir);
        // Use connection pool via getDb
        const db = await this.getDb(company_id);
        let table = await this.getTable(db);

        // If table doesn't exist, we must create it with the first valid item
        // If it does exist, we add to it.
        // We need to handle the case where no files are valid.

        const validFiles = files.filter(f => f.endsWith(".md") || f.endsWith(".txt"));
        if (validFiles.length === 0) {
             return {
                content: [{ type: "text", text: `No valid documents (.md, .txt) found in ${docsDir}.` }],
             };
        }

        let count = 0;
        let created = false;

        for (const file of validFiles) {
          const filePath = join(docsDir, file);
          try {
            const content = await readFile(filePath, "utf-8");
            const embedding = await this.llm.embed(content);

            if (!embedding) {
                console.warn(`Failed to embed ${file}`);
                continue;
            }

            const data = {
                id: file,
                content,
                source: filePath,
                vector: embedding,
            };

            if (!table) {
                table = await db.createTable("documents", [data]);
                // Need to re-fetch table wrapper after creation?
                // lancedb.createTable returns the table object.
                // Wait, previous code: table = await db.createTable
                created = true;
            } else {
                await table.add([data]);
            }
            count++;
          } catch (e) {
              console.error(`Error processing ${file}:`, e);
          }
        }

        return {
          content: [{ type: "text", text: `Successfully ingested ${count} documents for ${company_id}.` }],
        };
      }
    );

    this.server.tool(
      "query_company_context",
      "Query the company's vector database for relevant context.",
      {
        query: z.string().describe("The search query."),
        company_id: z.string().optional().describe("The ID of the company. Defaults to active context if not set."),
      },
      async ({ query, company_id }) => {
        const targetCompany = company_id || this.activeCompanyId || process.env.JULES_COMPANY;
        if (!targetCompany) {
          return {
            content: [{ type: "text", text: "No company ID provided and no active context set." }],
            isError: true,
          };
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(targetCompany)) {
             return {
                content: [{ type: "text", text: "Invalid company ID." }],
                isError: true
             };
        }

        // Use connection pool via getDb
        const db = await this.getDb(targetCompany);
        const table = await this.getTable(db);
        if (!table) {
          return { content: [{ type: "text", text: "No context found for this company (database empty)." }] };
        }

        const embedding = await this.llm.embed(query);
        if (!embedding) {
            return { content: [{ type: "text", text: "Failed to generate embedding for query." }], isError: true };
        }

        try {
            const results = await table.search(embedding).limit(3).toArray();
            const text = results.map((r: any) => `[Source: ${r.id}]\n${r.content}`).join("\n\n---\n\n");

            return {
            content: [{ type: "text", text: text || "No relevant documents found." }],
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Error querying database: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
        "list_companies",
        "List all available company contexts.",
        {},
        async () => {
            const companiesDir = join(process.cwd(), ".agent", "companies");
            if (!existsSync(companiesDir)) {
                return { content: [{ type: "text", text: "No companies found." }] };
            }
            const entries = await readdir(companiesDir, { withFileTypes: true });
            const companies = entries
                .filter(e => e.isDirectory())
                .map(e => e.name);

            return {
                content: [{ type: "text", text: companies.join(", ") }]
            };
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
