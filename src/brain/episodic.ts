import * as lancedb from "@lancedb/lancedb";
import { getEmbedder, Embedder } from "./embedder.js";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";

export interface EpisodicMemoryItem {
  id: string;
  timestamp: number;
  userPrompt: string;
  agentResponse: string;
  artifacts: string[];
  vector: number[];
  _distance?: number;
}

export class EpisodicMemory {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private embedder: Embedder | null = null;
  private tableName = "episodic_memories";

  constructor(baseDir: string = process.cwd()) {
    this.dbPath = join(baseDir, ".agent", "brain", "episodic.lancedb");
  }

  async init() {
    if (this.db && this.embedder) return;

    // Initialize embedder
    this.embedder = await getEmbedder();

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Connect to DB
    this.db = await lancedb.connect(this.dbPath);

    // Check if table exists
    try {
      this.table = await this.db.openTable(this.tableName);
    } catch {
      // Table will be created on first add
    }
  }

  async add(userPrompt: string, agentResponse: string, artifacts: string[] = []): Promise<void> {
    if (!this.embedder) await this.init();

    // Embed the interaction (prompt + response)
    const textToEmbed = `User: ${userPrompt}\nAgent: ${agentResponse}`;
    const embedding = await this.embedder!.embed(textToEmbed);

    const data = {
      id: randomUUID(),
      timestamp: Date.now(),
      userPrompt,
      agentResponse,
      artifacts, // LanceDB supports string arrays
      vector: embedding,
    };

    if (!this.table) {
      this.table = await this.db!.createTable(this.tableName, [data]);
    } else {
      await this.table.add([data]);
    }
  }

  async search(query: string, limit: number = 3): Promise<EpisodicMemoryItem[]> {
    if (!this.embedder) await this.init();

    if (!this.table) {
        try {
            this.table = await this.db!.openTable(this.tableName);
        } catch {
            return [];
        }
    }

    const embedding = await this.embedder!.embed(query);
    const results = await this.table!.search(embedding)
      .limit(limit)
      .toArray();

    return results as unknown as EpisodicMemoryItem[];
  }
}
