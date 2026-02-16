import { readFile, writeFile, mkdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { VectorStore } from "./memory/vector_store.js";

export interface ContextData {
  goals: string[];
  constraints: string[];
  recent_changes: string[];
}

export class ContextManager {
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

  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    const lockFile = this.contextFile + ".lock";
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
          // Check if lock is stale
          try {
            const stats = await stat(lockFile);
            const now = Date.now();
            if (now - stats.mtimeMs > staleThreshold) {
              console.warn(
                `[ContextManager] Found stale lock file (age: ${
                  now - stats.mtimeMs
                }ms). Removing...`,
              );
              try {
                await unlink(lockFile);
                // Try again immediately
                continue;
              } catch (unlinkError) {
                // Ignore, maybe another process removed it
              }
            }
          } catch (statError) {
            // Lock file might be gone already
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw e;
        }
      }
    }
    throw new Error(
      `Failed to acquire lock for ${this.contextFile} after ${maxRetries} attempts.`,
    );
  }

  private async internalLoad(): Promise<void> {
    if (existsSync(this.contextFile)) {
      try {
        const content = await readFile(this.contextFile, "utf-8");
        this.data = JSON.parse(content);
      } catch (e) {
        console.error("Failed to load context:", e);
      }
    }
  }

  private async internalSave(): Promise<void> {
    try {
      await mkdir(dirname(this.contextFile), { recursive: true });
      await writeFile(this.contextFile, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error("Failed to save context:", e);
    }
  }

  async loadContext(): Promise<void> {
    return this.withLock(() => this.internalLoad());
  }

  async saveContext(): Promise<void> {
    return this.withLock(() => this.internalSave());
  }

  async addGoal(goal: string): Promise<void> {
    await this.withLock(async () => {
      await this.internalLoad();
      if (!this.data.goals.includes(goal)) {
        this.data.goals.push(goal);
        await this.internalSave();
        if (this.vectorStore) {
          try {
            await this.vectorStore.add(`Goal: ${goal}`, { type: "goal" });
          } catch (e) {
            // Ignore vector store errors
          }
        }
      }
    });
  }

  async addConstraint(constraint: string): Promise<void> {
    await this.withLock(async () => {
      await this.internalLoad();
      if (!this.data.constraints.includes(constraint)) {
        this.data.constraints.push(constraint);
        await this.internalSave();
        if (this.vectorStore) {
          try {
            await this.vectorStore.add(`Constraint: ${constraint}`, {
              type: "constraint",
            });
          } catch (e) {
            // Ignore vector store errors
          }
        }
      }
    });
  }

  async logChange(change: string): Promise<void> {
    await this.withLock(async () => {
      await this.internalLoad();
      this.data.recent_changes.push(change);
      // Keep only last 10 changes
      if (this.data.recent_changes.length > 10) {
        this.data.recent_changes = this.data.recent_changes.slice(-10);
      }
      await this.internalSave();
      if (this.vectorStore) {
        try {
          await this.vectorStore.add(`Change: ${change}`, { type: "change" });
        } catch (e) {
          // Ignore vector store errors
        }
      }
    });
  }

  async getContextSummary(): Promise<string> {
    return this.withLock(async () => {
      await this.internalLoad();
      const parts: string[] = [];

      if (this.data.goals.length > 0) {
        parts.push(
          "## Current Goals\n" +
            this.data.goals.map((g) => `- ${g}`).join("\n"),
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
    });
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
