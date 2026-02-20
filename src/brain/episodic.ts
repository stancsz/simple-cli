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
  _distance?: number;
}

export class EpisodicMemory {
  private dbPath: string;
  private connector: LanceConnector;
  private llm: ReturnType<typeof createLLM>;
  private defaultTableName = "episodic_memories";

  constructor(baseDir: string = process.cwd(), llm?: ReturnType<typeof createLLM>) {
    // Store vector data in .agent/brain/episodic/
    // Unless overridden by BRAIN_STORAGE_ROOT env var
    const storageRoot = process.env.BRAIN_STORAGE_ROOT || join(baseDir, ".agent", "brain", "episodic");
    this.dbPath = storageRoot;
    this.connector = new LanceConnector(this.dbPath);
    this.llm = llm || createLLM();
  }

  async init() {
    await this.connector.connect();
  }

  private async getTable(company?: string): Promise<lancedb.Table | null> {
    let tableName = this.defaultTableName;
    if (company) {
        if (/^[a-zA-Z0-9_-]+$/.test(company)) {
            tableName = `episodic_memories_${company}`;
        } else {
            console.warn(`Invalid company name: ${company}, falling back to default table.`);
        }
    }

    return await this.connector.getTable(tableName);
  }

  private async getEmbedding(text: string): Promise<number[] | undefined> {
     if (process.env.MOCK_EMBEDDINGS === "true") {
         const hash = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
         // Use a fixed size vector.
         const vector = new Array(1536).fill(0).map((_, i) => ((hash * (i + 1)) % 1000) / 1000);
         return vector;
     }
     return await this.llm.embed(text);
  }

  async store(taskId: string, request: string, solution: string, artifacts: string[] = [], company?: string): Promise<void> {
    // Embed the interaction (request + solution)
    const textToEmbed = `Task: ${taskId}\nRequest: ${request}\nSolution: ${solution}`;
    const embedding = await this.getEmbedding(textToEmbed);

    if (!embedding) {
        throw new Error("Failed to generate embedding for memory.");
    }

    const data = {
      id: randomUUID(),
      taskId,
      timestamp: Date.now(),
      userPrompt: request,
      agentResponse: solution,
      artifacts: artifacts.length > 0 ? artifacts : ["none"],
      vector: embedding,
    };

    let tableName = this.defaultTableName;
    if (company) {
        if (/^[a-zA-Z0-9_-]+$/.test(company)) {
            tableName = `episodic_memories_${company}`;
        }
    }

    // Use the connector to acquire a lock for the company
    await this.connector.withLock(company, async () => {
        let table = await this.connector.getTable(tableName);

        if (!table) {
          try {
            table = await this.connector.createTable(tableName, [data]);
          } catch (e) {
            // Handle race condition where table was created by another process/request
            // Although withLock should prevent this for the same company table
            table = await this.connector.getTable(tableName);
            if (table) {
              await table.add([data]);
            } else {
              throw e;
            }
          }
        } else {
          await table.add([data]);
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
}
