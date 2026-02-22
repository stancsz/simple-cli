import * as lancedb from "@lancedb/lancedb";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { createLLM } from "../llm.js";
import { LanceConnector } from "../mcp_servers/brain/lance_connector.js";

export interface PastEpisode {
  id: string;
  taskId: string;
  timestamp: number;
  userPrompt: string;
  agentResponse: string;
  artifacts: string[];
  vector: number[];
  simulation_attempts?: string[];
  resolved_via_dreaming?: boolean;
  tokens?: number;
  duration?: number;
  _distance?: number;
}

export class EpisodicMemory {
  private baseDir: string;
  private connectors: Map<string, LanceConnector> = new Map();
  private llm: ReturnType<typeof createLLM>;
  private defaultTableName = "episodic_memories";

  constructor(baseDir: string = process.cwd(), llm?: ReturnType<typeof createLLM>) {
    this.baseDir = baseDir;
    this.llm = llm || createLLM();
  }

  async init() {
    // Initialize default connector
    await this.getConnector();
  }

  private async getConnector(company?: string): Promise<LanceConnector> {
    const key = company || "default";
    if (!this.connectors.has(key)) {
        let dbPath;
        if (company && company !== "default") {
            // Check if legacy table exists in default DB?
            // For simplicity and performance in this task, we enforce directory isolation for named companies
            // as per "Each company's Brain data should be isolated in .agent/brain/<company_id>/"

            if (!/^[a-zA-Z0-9_-]+$/.test(company)) {
                throw new Error(`Invalid company name: ${company}`);
            }

            // Path: .agent/brain/<company>/episodic
            dbPath = join(this.baseDir, ".agent", "brain", company, "episodic");
        } else {
            // Default path (root)
            dbPath = process.env.BRAIN_STORAGE_ROOT || join(this.baseDir, ".agent", "brain", "episodic");
        }

        const connector = new LanceConnector(dbPath);
        await connector.connect();
        this.connectors.set(key, connector);
    }
    return this.connectors.get(key)!;
  }

  private async getTable(company?: string): Promise<lancedb.Table | null> {
    const connector = await this.getConnector(company);

    // For isolated directories, we can just use "episodic_memories" as the table name
    // regardless of company name, because the DB itself is isolated.
    // However, to be extra safe or allow merging later, we can keep the suffix if we want.
    // But the requirement implies isolation.
    // Let's use defaultTableName ("episodic_memories") for isolated DBs.
    // For the default DB (no company), we use defaultTableName.

    // WAIT: If we are modifying existing logic, we must be careful.
    // Existing logic used `episodic_memories_<company>` in the default DB.
    // If we now point to a new DB, we should use a consistent table name inside it.

    const tableName = this.defaultTableName;
    return await connector.getTable(tableName);
  }

  private async getEmbedding(text: string): Promise<number[] | undefined> {
     if (process.env.MOCK_EMBEDDINGS === "true") {
         const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
         const vector = new Array(1536).fill(0).map((_, i) => ((hash * (i + 1)) % 1000) / 1000);
         return vector;
     }
     return await this.llm.embed(text);
  }

  async store(
      taskId: string,
      request: string,
      solution: string,
      artifacts: string[] = [],
      company?: string,
      simulation_attempts?: string[],
      resolved_via_dreaming?: boolean,
      id?: string,
      tokens?: number,
      duration?: number
  ): Promise<void> {
    const textToEmbed = `Task: ${taskId}\nRequest: ${request}\nSolution: ${solution}`;
    const embedding = await this.getEmbedding(textToEmbed);

    if (!embedding) {
        throw new Error("Failed to generate embedding for memory.");
    }

    const data: PastEpisode = {
      id: id || randomUUID(),
      taskId,
      timestamp: Date.now(),
      userPrompt: request,
      agentResponse: solution,
      artifacts: artifacts.length > 0 ? artifacts : ["none"],
      vector: embedding,
      simulation_attempts,
      resolved_via_dreaming,
      tokens: tokens || 0,
      duration: duration || 0
    };

    const connector = await this.getConnector(company);
    const tableName = this.defaultTableName;

    await connector.withLock(company, async () => {
        let table = await connector.getTable(tableName);

        if (!table) {
          try {
            table = await connector.createTable(tableName, [data as any]);
          } catch (e) {
            table = await connector.getTable(tableName);
            if (table) {
              await table.add([data as any]);
            } else {
              throw e;
            }
          }
        } else {
          await table.add([data as any]);
        }
    });
  }

  async delete(id: string, company?: string): Promise<void> {
    const connector = await this.getConnector(company);
    const tableName = this.defaultTableName;

    await connector.withLock(company, async () => {
        const table = await connector.getTable(tableName);
        if (table) {
            try {
                await table.delete(`id = '${id}'`);
            } catch (e) {
                console.warn(`Failed to delete episode ${id}:`, e);
            }
        }
    });
  }

  async recall(query: string, limit: number = 3, company?: string): Promise<PastEpisode[]> {
    const table = await this.getTable(company);
    if (!table) return [];

    const embedding = await this.getEmbedding(query);
    if (!embedding) return [];

    const results = await table.search(embedding)
      .limit(limit)
      .toArray();

    return results as unknown as PastEpisode[];
  }

  async getRecentEpisodes(company?: string, limit: number = 100): Promise<PastEpisode[]> {
    const table = await this.getTable(company);
    if (!table) return [];

    const results = await table.query()
        .limit(limit)
        .toArray();

    return (results as unknown as PastEpisode[])
        .sort((a, b) => b.timestamp - a.timestamp);
  }
}
