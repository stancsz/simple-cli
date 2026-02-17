import * as lancedb from "@lancedb/lancedb";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { createLLM } from "../llm.js";

export interface CompanyContext {
  id: string;
  text: string;
  metadata: string; // Stored as JSON string
  vector: number[];
  company: string;
  timestamp: number;
  _distance?: number;
}

export class CompanyContextMemory {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private llm: ReturnType<typeof createLLM>;
  private defaultTableName = "company_context";

  constructor(baseDir: string = process.cwd(), llm?: ReturnType<typeof createLLM>) {
    // Store vector data in .agent/brain/company_context/
    this.dbPath = join(baseDir, ".agent", "brain", "company_context");
    this.llm = llm || createLLM();
  }

  async init() {
    if (this.db) return;

    // Ensure directory exists
    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }

    // Connect to DB
    this.db = await lancedb.connect(this.dbPath);
  }

  private async getTable(company: string): Promise<lancedb.Table | null> {
    if (!this.db) await this.init();

    // Sanitize company name for table name safety
    const safeCompany = company.replace(/[^a-zA-Z0-9_-]/g, "_");
    const tableName = `${this.defaultTableName}_${safeCompany}`;

    try {
      const tableNames = await this.db!.tableNames();
      if (tableNames.includes(tableName)) {
        return await this.db!.openTable(tableName);
      }
    } catch (e) {
      console.warn(`Failed to open table ${tableName}:`, e);
    }
    return null;
  }

  async store(company: string, text: string, metadata: any = {}): Promise<void> {
    if (!this.db) await this.init();

    const embedding = await this.llm.embed(text);
    if (!embedding) {
        throw new Error("Failed to generate embedding for context.");
    }

    const data: CompanyContext = {
      id: randomUUID(),
      text,
      metadata: JSON.stringify(metadata),
      vector: embedding,
      company,
      timestamp: Date.now(),
    };

    // Sanitize company name for table name safety
    const safeCompany = company.replace(/[^a-zA-Z0-9_-]/g, "_");
    const tableName = `${this.defaultTableName}_${safeCompany}`;

    let table = await this.getTable(company);

    if (!table) {
      table = await this.db!.createTable(tableName, [data]);
    } else {
      await table.add([data]);
    }
  }

  async query(company: string, query: string, limit: number = 5): Promise<CompanyContext[]> {
    if (!this.db) await this.init();

    const table = await this.getTable(company);
    if (!table) return [];

    const embedding = await this.llm.embed(query);
    if (!embedding) return [];

    const results = await table.search(embedding)
      .limit(limit)
      .toArray();

    return results as unknown as CompanyContext[];
  }
}
