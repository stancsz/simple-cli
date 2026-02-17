import * as lancedb from "@lancedb/lancedb";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { createLLM } from "../llm.js";

export interface PastEpisode {
  id: string;
  taskId: string;
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
  private llm: ReturnType<typeof createLLM>;
  private tableName = "episodic_memories";

  constructor(baseDir: string = process.cwd(), llm?: ReturnType<typeof createLLM>) {
    // Store vector data in .agent/brain/episodic/
    this.dbPath = join(baseDir, ".agent", "brain", "episodic");
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

    // Check if table exists
    try {
        const tableNames = await this.db.tableNames();
        if (tableNames.includes(this.tableName)) {
            this.table = await this.db.openTable(this.tableName);
        }
    } catch (e) {
      console.warn("Failed to open table, will create on first write:", e);
    }
  }

  async store(taskId: string, request: string, solution: string, artifacts: string[] = [], embedding?: number[]): Promise<void> {
    if (!this.db) await this.init();

    let vector = embedding;
    if (!vector) {
      // Embed the interaction (request + solution)
      const textToEmbed = `Task: ${taskId}\nRequest: ${request}\nSolution: ${solution}`;
      vector = await this.llm.embed(textToEmbed);
    }

    if (!vector) {
        throw new Error("Failed to generate embedding for memory.");
    }

    const data = {
      id: randomUUID(),
      taskId,
      timestamp: Date.now(),
      userPrompt: request,
      agentResponse: solution,
      artifacts,
      vector,
    };

    if (!this.table) {
      this.table = await this.db!.createTable(this.tableName, [data]);
    } else {
      await this.table.add([data]);
    }
  }

  async recall(query: string, limit: number = 3): Promise<PastEpisode[]> {
    if (!this.db) await this.init();

    if (!this.table) {
        // Try to open again if it was created by another process?
        // Or if it simply doesn't exist, return empty.
        try {
             const tableNames = await this.db!.tableNames();
             if (tableNames.includes(this.tableName)) {
                 this.table = await this.db!.openTable(this.tableName);
             } else {
                 return [];
             }
        } catch {
            return [];
        }
    }

    const embedding = await this.llm.embed(query);
    if (!embedding) return [];

    const results = await this.table!.search(embedding)
      .limit(limit)
      .toArray();

    return results as unknown as PastEpisode[];
  }
}
