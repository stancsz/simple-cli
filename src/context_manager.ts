import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { VectorStore } from "./memory/vector_store.js";

export interface ContextData {
  goals: string[];
  constraints: string[];
  recent_changes: string[];
}

export class ContextManager {
  // TODO: [Concurrency] This class is instantiated multiple times across different processes
  // (engine, MCP servers) without file locking.
  // Converting this to a centralized 'Context MCP Server' or using a lockfile is critical.
  private contextFile: string;
  private vectorStore: VectorStore | null = null;
  private data: ContextData = {
    goals: [],
    constraints: [],
    recent_changes: [],
  };

  constructor(cwd: string = process.cwd(), embeddingModel?: any) {
    this.contextFile = join(cwd, ".agent", "context.json");
    try {
      this.vectorStore = new VectorStore(cwd, embeddingModel);
    } catch (e) {
      console.warn("Failed to initialize vector store:", e);
    }
  }

  async loadContext(): Promise<void> {
    if (existsSync(this.contextFile)) {
      try {
        const content = await readFile(this.contextFile, "utf-8");
        this.data = JSON.parse(content);
      } catch (e) {
        console.error("Failed to load context:", e);
      }
    }
  }

  async saveContext(): Promise<void> {
    try {
      await mkdir(dirname(this.contextFile), { recursive: true });
      await writeFile(this.contextFile, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("Failed to save context:", e);
    }
  }

  async addGoal(goal: string): Promise<void> {
    await this.loadContext();
    if (!this.data.goals.includes(goal)) {
      this.data.goals.push(goal);
      await this.saveContext();
      if (this.vectorStore) await this.vectorStore.add(`Goal: ${goal}`, { type: 'goal' });
    }
  }

  async addConstraint(constraint: string): Promise<void> {
    await this.loadContext();
    if (!this.data.constraints.includes(constraint)) {
      this.data.constraints.push(constraint);
      await this.saveContext();
      if (this.vectorStore) await this.vectorStore.add(`Constraint: ${constraint}`, { type: 'constraint' });
    }
  }

  async logChange(change: string): Promise<void> {
    await this.loadContext();
    this.data.recent_changes.push(change);
    // Keep only last 10 changes
    if (this.data.recent_changes.length > 10) {
      this.data.recent_changes = this.data.recent_changes.slice(-10);
    }
    await this.saveContext();
    if (this.vectorStore) await this.vectorStore.add(`Change: ${change}`, { type: 'change' });
  }

  async getContextSummary(): Promise<string> {
    await this.loadContext();
    const parts: string[] = [];

    if (this.data.goals.length > 0) {
      parts.push(
        "## Current Goals\n" + this.data.goals.map((g) => `- ${g}`).join("\n"),
      );
    }

    if (this.data.constraints.length > 0) {
      parts.push(
        "## Constraints & Guidelines\n" +
        this.data.constraints.map((c) => `- ${c}`).join("\n"),
      );
    }

    if (this.data.recent_changes.length > 0) {
      parts.push(
        "## Recent Architectural Changes\n" +
        this.data.recent_changes.map((c) => `- ${c}`).join("\n"),
      );
    }

    return parts.join("\n\n");
  }

  getContextData(): ContextData {
    return this.data;
  }

  async searchMemory(query: string, limit: number = 5): Promise<string> {
    if (!this.vectorStore) return "Memory not available.";
    const results = await this.vectorStore.search(query, limit);
    if (results.length === 0) return "No relevant memory found.";
    return results.map(r => `- ${r.text} (Similarity: ${(1 - (r.distance || 0)).toFixed(2)})`).join("\n");
  }

  async addMemory(text: string, metadata: any = {}): Promise<void> {
    if (this.vectorStore) {
      await this.vectorStore.add(text, metadata);
    }
  }

  close() {
    if (this.vectorStore) {
      this.vectorStore.close();
    }
  }
}
