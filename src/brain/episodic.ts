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
  tags?: string[];
  vector: number[];
  _distance?: number;
}

export class EpisodicMemory {
  private dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private llm: ReturnType<typeof createLLM>;
  private tableName = "episodic_memories_v2";

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

  async store(taskId: string, request: string, solution: string, artifacts: string[] = [], tags: string[] = []): Promise<void> {
    if (!this.db) await this.init();

    // Embed the interaction (request + solution)
    const textToEmbed = `Task: ${taskId}\nRequest: ${request}\nSolution: ${solution}\nTags: ${tags.join(", ")}`;
    const embedding = await this.llm.embed(textToEmbed);

    if (!embedding) {
        throw new Error("Failed to generate embedding for memory.");
    }

    const data = {
      id: randomUUID(),
      taskId,
      timestamp: Date.now(),
      userPrompt: request,
      agentResponse: solution,
      artifacts,
      tags,
      vector: embedding,
    };

    if (!this.table) {
      this.table = await this.db!.createTable(this.tableName, [data]);
    } else {
      await this.table.add([data]);
    }
  }

  async recall(query: string, limit: number = 3, filters: { tags?: string[], minTimestamp?: number } = {}): Promise<PastEpisode[]> {
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

    let search: any;

    // If query is provided, perform vector search
    if (query && query.trim().length > 0) {
        const embedding = await this.llm.embed(query);
        if (!embedding) return [];
        search = this.table!.search(embedding);
    } else {
        // Fallback to query() if available or just empty search (LanceDB might require vector search usually)
        // Note: lancedb-js search() usually requires vector.
        // However, we can use filter only if we don't care about similarity?
        // LanceDB JS client `search` needs a vector.
        // If query is empty, maybe we just want to retrieve recent items?
        // We can just use a dummy vector or query "everything".
        // Or better, just search for "summary" or the tags themselves as query.
        const embedding = await this.llm.embed("autonomous task summary");
         if (!embedding) return [];
        search = this.table!.search(embedding);
    }

    if (filters.minTimestamp) {
        search = search.where(`timestamp > ${filters.minTimestamp}`);
    }

    const results = await search.limit(limit).toArray();
    let episodes = results as unknown as PastEpisode[];

    // In-memory filter for tags (since LanceDB array support varies)
    if (filters.tags && filters.tags.length > 0) {
        episodes = episodes.filter(ep =>
            ep.tags && filters.tags!.every(t => ep.tags!.includes(t))
        );
    }

    return episodes;
  }
}
