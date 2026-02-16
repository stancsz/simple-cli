import * as lancedb from "@lancedb/lancedb";
import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";

export interface MemoryItem {
  id?: string;
  text: string;
  metadata?: any;
  created_at?: number;
}

export class EpisodicMemory {
  private dbPath: string;
  private db: any = null; // Use any to avoid type issues if @lancedb/lancedb types are tricky
  private table: any = null;
  private embeddingModel: any;
  private tableName = "memories";

  constructor(baseDir: string = process.cwd(), embeddingModel?: any) {
    this.dbPath = join(baseDir, ".agent", "brain", "episodic.lancedb");

    if (embeddingModel) {
      this.embeddingModel = embeddingModel;
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const openai = createOpenAI({ apiKey });
        this.embeddingModel = openai.embedding("text-embedding-3-small");
      } else {
        console.warn("OPENAI_API_KEY not found. Episodic memory will be read-only or fail to write.");
      }
    }
  }

  async init() {
    if (this.db) return;

    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = await lancedb.connect(this.dbPath);

    // Check if table exists
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  async add(text: string, metadata: any = {}): Promise<void> {
    if (!this.embeddingModel) throw new Error("No embedding model configured");
    if (!this.db) await this.init();

    const { embedding } = await embed({
      model: this.embeddingModel,
      value: text,
    });

    const data = [{
      id: randomUUID(),
      text,
      metadata: JSON.stringify(metadata),
      vector: embedding,
      created_at: Date.now(),
    }];

    if (!this.table) {
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
        await this.table.add(data);
      } else {
        // Create table with initial data to infer schema
        this.table = await this.db.createTable(this.tableName, data);
      }
    } else {
      await this.table.add(data);
    }
  }

  async search(query: string, limit: number = 5): Promise<any[]> {
    if (!this.embeddingModel) throw new Error("No embedding model configured");
    if (!this.db) await this.init();

    if (!this.table) {
        const tableNames = await this.db.tableNames();
        if (tableNames.includes(this.tableName)) {
             this.table = await this.db.openTable(this.tableName);
        } else {
            return [];
        }
    }

    const { embedding } = await embed({
      model: this.embeddingModel,
      value: query,
    });

    // In @lancedb/lancedb, search is search(vector) or query().nearestTo(vector)
    // For 0.x versions, .search() usually works.
    const results = await this.table.search(embedding)
      .limit(limit)
      .toArray();

    return results.map((r: any) => ({
      id: r.id,
      text: r.text,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      created_at: r.created_at,
      distance: r._distance
    }));
  }
}
