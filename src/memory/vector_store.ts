import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export interface VectorDocument {
  id: string;
  text: string;
  metadata?: any;
  distance?: number;
}

export class VectorStore {
  private db: Database.Database;
  private embeddingModel: any;

  constructor(baseDir: string = process.cwd(), embeddingModel?: any, company?: string) {
    const dbPath = company
      ? join(baseDir, ".agent", "companies", company, "memory.sqlite")
      : join(baseDir, ".agent", "memory.sqlite");

    if (!existsSync(dirname(dbPath))) {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    sqliteVec.load(this.db);
    this.init();

    if (embeddingModel) {
      this.embeddingModel = embeddingModel;
    } else {
      // Default to OpenAI for embeddings
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const openai = createOpenAI({ apiKey });
        // Use older model which might have broader access
        this.embeddingModel = openai.embedding("text-embedding-ada-002");
      } else {
        console.warn("OPENAI_API_KEY not found. Vector memory will not function.");
      }
    }
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
        embedding float[1536]
      );
    `);
  }

  async add(text: string, metadata: any = {}): Promise<void> {
    if (!this.embeddingModel) throw new Error("No embedding model configured");

    const { embedding } = await embed({
      model: this.embeddingModel,
      value: text,
    });

    const insert = this.db.prepare(
      "INSERT INTO documents (text, metadata) VALUES (?, ?) RETURNING id"
    );
    const insertVec = this.db.prepare(
      "INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)"
    );

    const txn = this.db.transaction(() => {
      const info = insert.get(text, JSON.stringify(metadata)) as { id: number | bigint };
      // Ensure id is a number/bigint compatible with sqlite-vec
      if (typeof info.id === 'undefined') throw new Error("Insert failed, no ID returned");
      // Ensure BigInt for rowid in vec0
      insertVec.run(BigInt(info.id), new Float32Array(embedding));
    });

    txn();
  }

  async search(query: string, limit: number = 5): Promise<VectorDocument[]> {
    if (!this.embeddingModel) throw new Error("No embedding model configured");

    const { embedding } = await embed({
      model: this.embeddingModel,
      value: query,
    });

    // sqlite-vec query
    const results = this.db
      .prepare(
        `
        SELECT
          rowid,
          distance
        FROM vec_items
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `
      )
      .all(new Float32Array(embedding), limit) as {
      rowid: number;
      distance: number;
    }[];

    if (results.length === 0) return [];

    const docs = this.db
      .prepare(
        `SELECT id, text, metadata FROM documents WHERE id IN (${results
          .map(() => "?")
          .join(",")})`
      )
      .all(...results.map((r) => r.rowid)) as {
      id: number;
      text: string;
      metadata: string;
    }[];

    return results
      .map((r) => {
        const doc = docs.find((d) => d.id === r.rowid);
        if (!doc) return null;
        return {
          id: String(doc.id),
          text: doc.text,
          metadata: JSON.parse(doc.metadata),
          distance: r.distance,
        };
      })
      .filter((d) => d !== null) as VectorDocument[];
  }

  close() {
    this.db.close();
  }
}
