import * as lancedb from "@lancedb/lancedb";
import { LLM } from "../llm.js";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { writeFile, unlink, stat, readdir } from "fs/promises";

export interface CompanyConfig {
  name: string;
  brand_voice: string;
  embeddings_model?: string;
}

interface ContextDocument {
  text: string;
  metadata: string; // JSON string
  vector: number[];
  created_at: number;
  [key: string]: unknown;
}

export class CompanyContext {
  private dbPath: string;
  private configPath: string;
  private llm: LLM;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  public companyId: string;

  constructor(llm: LLM, company?: string) {
    this.llm = llm;
    const baseDir = process.cwd();
    this.companyId = company || process.env.JULES_COMPANY || "";

    if (!this.companyId) {
      throw new Error("CompanyContext requires a company ID (or JULES_COMPANY env var).");
    }

    this.dbPath = join(baseDir, ".agent", "contexts", this.companyId);
    this.configPath = join(this.dbPath, "config.json");

    if (!existsSync(this.dbPath)) {
      mkdirSync(this.dbPath, { recursive: true });
    }
  }

  // File locking mechanism compatible with ContextManager
  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    const lockFile = this.configPath + ".lock";
    const maxRetries = 100; // 10 seconds
    const retryDelay = 100;
    const staleThreshold = 30000; // 30 seconds

    for (let i = 0; i < maxRetries; i++) {
      try {
        await writeFile(lockFile, "", { flag: "wx" });
        try {
          return await action();
        } finally {
          try {
            await unlink(lockFile);
          } catch {}
        }
      } catch (e: any) {
        if (e.code === "EEXIST") {
          try {
            const stats = await stat(lockFile);
            const now = Date.now();
            if (now - stats.mtimeMs > staleThreshold) {
              try {
                await unlink(lockFile);
                continue;
              } catch {}
            }
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw e;
        }
      }
    }
    throw new Error(`Failed to acquire lock for ${this.configPath}`);
  }

  async init(): Promise<void> {
    // If db is already initialized and table exists, skip
    if (this.db && this.table) return;

    this.db = await lancedb.connect(this.dbPath);
    try {
      this.table = await this.db.openTable("documents");
    } catch {
      // Table doesn't exist yet, will be created on first store
    }

    // Ensure config exists
    if (!existsSync(this.configPath)) {
      const defaultConfig: CompanyConfig = {
        name: this.companyId,
        brand_voice: "Professional and concise.",
      };
      writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
    }
  }

  async store(text: string, metadata: any = {}): Promise<void> {
    await this.withLock(async () => {
      if (!this.db) await this.init();

      const vector = await this.llm.embed(text);
      const doc: ContextDocument = {
        text,
        metadata: JSON.stringify(metadata),
        vector,
        created_at: Date.now(),
      };

      if (!this.table) {
        try {
            // Check if table exists again just in case (race condition handled by lock mostly)
            this.table = await this.db!.openTable("documents");
             await this.table.add([doc]);
        } catch {
            this.table = await this.db!.createTable("documents", [doc]);
        }
      } else {
          await this.table.add([doc]);
      }
    });
  }

  async query(query: string, limit: number = 5): Promise<{ text: string; metadata: any; score: number }[]> {
    if (!this.db) await this.init();

    if (!this.table) {
        try {
            this.table = await this.db!.openTable("documents");
        } catch {
            return []; // No table, no data
        }
    }

    const vector = await this.llm.embed(query);
    const results = await this.table!.search(vector).limit(limit).toArray();

    return results.map((r: any) => ({
      text: r.text,
      metadata: JSON.parse(r.metadata),
      score: 1 - (r._distance || 0),
    }));
  }

  static async listCompanies(): Promise<string[]> {
    const contextsDir = join(process.cwd(), ".agent", "contexts");
    if (!existsSync(contextsDir)) return [];

    const entries = await readdir(contextsDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  }

  async getConfig(): Promise<CompanyConfig> {
      if (existsSync(this.configPath)) {
          return JSON.parse(readFileSync(this.configPath, "utf-8"));
      }
      return { name: this.companyId, brand_voice: "" };
  }
}
