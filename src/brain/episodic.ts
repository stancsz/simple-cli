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
  private llm: ReturnType<typeof createLLM>;
  private defaultTableName = "episodic_memories";

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
  }

  private async getTable(company?: string): Promise<lancedb.Table | null> {
    if (!this.db) await this.init();

    let tableName = this.defaultTableName;
    if (company) {
        if (/^[a-zA-Z0-9_-]+$/.test(company)) {
            tableName = `episodic_memories_${company}`;
        } else {
            console.warn(`Invalid company name: ${company}, falling back to default table.`);
        }
    }

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

  async store(taskId: string, request: string, solution: string, artifacts: string[] = [], company?: string): Promise<void> {
    if (!this.db) await this.init();

    // Embed the interaction (request + solution)
    const textToEmbed = `Task: ${taskId}\nRequest: ${request}\nSolution: ${solution}`;
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
      vector: embedding,
    };

    let tableName = this.defaultTableName;
    if (company) {
        if (/^[a-zA-Z0-9_-]+$/.test(company)) {
            tableName = `episodic_memories_${company}`;
        }
    }

    let table = await this.getTable(company);

    if (!table) {
      table = await this.db!.createTable(tableName, [data]);
    } else {
      await table.add([data]);
    }
  }

  async recall(query: string, limit: number = 3, company?: string): Promise<PastEpisode[]> {
    if (!this.db) await this.init();

    const table = await this.getTable(company);
    if (!table) return [];

    const embedding = await this.llm.embed(query);
    if (!embedding) return [];

    const results = await table.search(embedding)
      .limit(limit)
      .toArray();

    return results as unknown as PastEpisode[];
  }

  async retrieveLatest(limit: number = 1, company?: string, where?: string): Promise<PastEpisode[]> {
    if (!this.db) await this.init();

    const table = await this.getTable(company);
    if (!table) return [];

    try {
      let query = table.query();
      if (where) query = query.where(where);

      // LanceDB Node SDK doesn't support orderBy in non-vector queries yet.
      // We fetch all matching records and sort in memory.
      // This is acceptable as filtered set (e.g. context snapshots) should be small.
      const results = await query.toArray();

      results.sort((a: any, b: any) => b.timestamp - a.timestamp);

      return results.slice(0, limit) as unknown as PastEpisode[];
    } catch (e) {
      console.warn("Failed to retrieve latest episodes:", e);
      return [];
    }
  }
}
