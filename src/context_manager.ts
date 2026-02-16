import { readFile, writeFile, mkdir, unlink, stat } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface ContextData {
  goals: string[];
  constraints: string[];
  recent_changes: string[];
}

export class ContextManager {
  private contextFile: string;
  private brainClient: Client | null = null;
  private data: ContextData = {
    goals: [],
    constraints: [],
    recent_changes: [],
  };
  private cwd: string;

  constructor(cwd: string = process.cwd(), embeddingModel?: any) {
    this.cwd = cwd;
    const company = process.env.JULES_COMPANY;
    if (company) {
      this.contextFile = join(cwd, ".agent", "companies", company, "context.json");
    } else {
      this.contextFile = join(cwd, ".agent", "context.json");
    }
  }

  setCompany(company: string) {
    // Update contextFile path
    this.contextFile = join(this.cwd, ".agent", "companies", company, "context.json");

    // Reset data
    this.data = { goals: [], constraints: [], recent_changes: [] };

    // Reset brain client to ensure we get a new connection if needed (though SSE is stateless-ish, the transport is stateful)
    if (this.brainClient) {
        this.brainClient.close().catch(() => {});
        this.brainClient = null;
    }
  }

  private async getBrain() {
    if (this.brainClient) return this.brainClient;

    const url = process.env.BRAIN_MCP_URL || "http://localhost:3002/sse";
    const transport = new SSEClientTransport(new URL(url));

    const client = new Client(
      { name: "context-manager", version: "1.0.0" },
      { capabilities: {} }
    );

    try {
        await client.connect(transport);
        this.brainClient = client;
        return client;
    } catch (e) {
        // Log warning but don't crash, caller will handle
        console.warn(`Failed to connect to Brain MCP server at ${url}. Ensure it is running.`);
        throw e;
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

        try {
            const brain = await this.getBrain();
            await brain.callTool({
                name: "store_episodic_memory",
                arguments: {
                    text: `Goal: ${goal}`,
                    metadata: JSON.stringify({ type: "goal", company: process.env.JULES_COMPANY })
                }
            });
        } catch (e) {
            console.warn("Failed to sync goal to brain:", e);
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

        try {
            const brain = await this.getBrain();
            await brain.callTool({
                name: "store_episodic_memory",
                arguments: {
                    text: `Constraint: ${constraint}`,
                    metadata: JSON.stringify({ type: "constraint", company: process.env.JULES_COMPANY })
                }
            });
        } catch (e) {
            console.warn("Failed to sync constraint to brain:", e);
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

      try {
            const brain = await this.getBrain();
            await brain.callTool({
                name: "store_episodic_memory",
                arguments: {
                    text: `Change: ${change}`,
                    metadata: JSON.stringify({ type: "change", company: process.env.JULES_COMPANY })
                }
            });
        } catch (e) {
            console.warn("Failed to sync change to brain:", e);
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
    try {
        const brain = await this.getBrain();
        const result: any = await brain.callTool({
            name: "query_episodic_memory",
            arguments: { query, limit }
        });

        if (result && result.content && result.content[0] && result.content[0].text) {
            return result.content[0].text;
        }
        return "No relevant memory found.";
    } catch (e) {
        console.warn("Failed to search brain memory:", e);
        return "Memory unavailable.";
    }
  }

  async addMemory(text: string, metadata: any = {}): Promise<void> {
    try {
        const brain = await this.getBrain();
        const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

        await brain.callTool({
            name: "store_episodic_memory",
            arguments: { text, metadata: metaStr }
        });
    } catch (e) {
        console.warn("Failed to add memory to brain:", e);
    }
  }

  close() {
    if (this.brainClient) {
        this.brainClient.close().catch(() => {});
    }
  }
}
