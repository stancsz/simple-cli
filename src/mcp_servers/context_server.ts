import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
// @ts-ignore - No type definitions available
import { lock } from "proper-lockfile";
import { ContextSchema, ContextData, ContextManager } from "../core/context.js";
import { MCP } from "../mcp.js";

// Deep merge helper
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return source;

  const output = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    }
  }
  return output;
}

export class ContextServer implements ContextManager {
  private contextFile: string;
  private cwd: string;
  private mcp: MCP | null = null;
  private brainClient: any = null;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    const company = process.env.JULES_COMPANY;
    if (company) {
      this.contextFile = join(cwd, ".agent", "companies", company, "context.json");
    } else {
      this.contextFile = join(cwd, ".agent", "context.json");
    }
  }

  private async getBrainClient() {
    if (this.brainClient) return this.brainClient;

    if (!this.mcp) {
      this.mcp = new MCP();
      await this.mcp.init();
    }

    this.brainClient = this.mcp.getClient("brain");

    if (!this.brainClient) {
      try {
        await this.mcp.startServer("brain");
        this.brainClient = this.mcp.getClient("brain");
      } catch (e) {
        console.warn("Failed to connect to Brain server:", e);
      }
    }
    return this.brainClient;
  }

  // Helper method to query Brain memory
  private async queryBrainMemory(key: string): Promise<ContextData | null> {
    try {
      const brain = await this.getBrainClient();
      if (brain) {
        const res: any = await brain.callTool({
          name: "recall_memory",
          arguments: { key }
        });

        if (res && res.content && res.content[0] && !res.isError) {
          const text = res.content[0].text;
          if (text && text !== "Memory not found.") {
            const data = JSON.parse(text);
            if (data.value) {
              const context = JSON.parse(data.value);
              const parsed = ContextSchema.safeParse(context);
              if (parsed.success) return parsed.data;
            }
          }
        }
      }
    } catch (e) {
      // Ignore brain errors
    }
    return null;
  }

  // Helper method to store to Brain memory
  private async storeBrainMemory(key: string, value: string, metadata: any): Promise<void> {
    try {
      const brain = await this.getBrainClient();
      if (brain) {
        await brain.callTool({
          name: "store_memory",
          arguments: {
            key,
            value,
            metadata
          }
        });
      }
    } catch (e) {
      console.warn("Failed to store to Brain:", e);
    }
  }

  // Internal lock wrapper
  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    // Ensure directory exists
    if (!existsSync(dirname(this.contextFile))) {
      await mkdir(dirname(this.contextFile), { recursive: true });
    }
    // Ensure file exists for locking
    if (!existsSync(this.contextFile)) {
      await writeFile(this.contextFile, "{}");
    }

    let release: () => Promise<void>;
    try {
      release = await lock(this.contextFile, {
        retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 },
        stale: 10000
      });
    } catch (e: any) {
      throw new Error(`Failed to acquire lock for ${this.contextFile}: ${e.message}`);
    }

    try {
      return await action();
    } finally {
      await release();
    }
  }

  async readContext(lockId?: string): Promise<ContextData> {
    const key = `project:${encodeURIComponent(this.cwd)}:context`;
    const brainContext = await this.queryBrainMemory(key);

    if (brainContext) {
        return brainContext;
    }

    return this.withLock(async () => {
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          const json = JSON.parse(content);
          const parsed = ContextSchema.safeParse(json);
          if (parsed.success) {
            return parsed.data;
          } else {
            console.warn("Context schema validation failed, returning default/partial:", parsed.error);
            return ContextSchema.parse(json);
          }
        } catch {
          return ContextSchema.parse({});
        }
      }
      return ContextSchema.parse({});
    });
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    const key = `project:${encodeURIComponent(this.cwd)}:context`;

    return this.withLock(async () => {
      let current = {};
      let loadedFromBrain = false;

      // 1. Try reading current state from Brain INSIDE lock to prevent race conditions
      // Note: This makes the lock held longer (network call), but ensures consistency.
      const brainContext = await this.queryBrainMemory(key);
      if (brainContext) {
        current = brainContext;
        loadedFromBrain = true;
      }

      // 2. If not loaded from Brain, try local file
      if (!loadedFromBrain && existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }

      const merged = deepMerge(current, updates);

      // 3. Apply business logic: Deduplicate and Limit
      if (merged.goals) {
        merged.goals = [...new Set(merged.goals)];
      }
      if (merged.constraints) {
        merged.constraints = [...new Set(merged.constraints)];
      }
      if (merged.recent_changes) {
        // Keep unique changes, latest first? or just latest 10?
        // Usually recent changes are append-only.
        // If deepMerge appends, we might have duplicates.
        // Assuming deepMerge replaces arrays or merges them?
        // My deepMerge function:
        // if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) { ... }
        // else { Object.assign(output, { [key]: source[key] }); }
        // Arrays are overwritten by source! So updates.recent_changes overwrites current.recent_changes.
        // Wait, ContextManager usually appends.
        // If the tool user passes the FULL new array, deepMerge is fine.
        // If the tool user passes just new items, they expect append?
        // The `update_context` tool usually sends the *modified* list.
        // But if I want to enforce limits, I should check the result.
        if (Array.isArray(merged.recent_changes)) {
             // Deduplicate just in case
             merged.recent_changes = [...new Set(merged.recent_changes)];
             // Limit to last 10
             if (merged.recent_changes.length > 10) {
                 merged.recent_changes = merged.recent_changes.slice(-10);
             }
        }
      }

      const parsed = ContextSchema.safeParse(merged);
      if (!parsed.success) {
        throw new Error(`Invalid context update: ${parsed.error.message}`);
      }

      const finalContext = parsed.data;
      finalContext.last_updated = new Date().toISOString();

      // Write to local
      await writeFile(this.contextFile, JSON.stringify(finalContext, null, 2));

      // Write to Brain
      await this.storeBrainMemory(key, JSON.stringify(finalContext), {
          timestamp: Date.now(),
          agent: "context-server",
          summary: "Context updated"
      });

      return finalContext;
    });
  }

  async clearContext(lockId?: string): Promise<void> {
    await this.withLock(async () => {
      const empty = ContextSchema.parse({});
      await writeFile(this.contextFile, JSON.stringify(empty, null, 2));
    });

    // Clear from Brain too
    const key = `project:${encodeURIComponent(this.cwd)}:context`;
    const empty = ContextSchema.parse({});
    await this.storeBrainMemory(key, JSON.stringify(empty), {
        timestamp: Date.now(),
        summary: "Context cleared"
    });
  }
}

const server = new McpServer({
  name: "context_server",
  version: "1.0.0",
});

const manager = new ContextServer();

server.tool(
  "read_context",
  "Read the current context.",
  {},
  async () => {
    const context = await manager.readContext();
    return {
      content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
    };
  }
);

server.tool(
  "update_context",
  "Update the context with partial updates (deep merged).",
  {
    updates: z.string().describe("JSON string of updates to merge"),
  },
  async ({ updates }) => {
    let parsedUpdates;
    try {
      parsedUpdates = JSON.parse(updates);
    } catch (e) {
      return {
        content: [{ type: "text", text: "Error: updates must be valid JSON string" }],
        isError: true
      };
    }

    try {
      const newContext = await manager.updateContext(parsedUpdates);
      return {
        content: [{ type: "text", text: JSON.stringify(newContext, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error updating context: ${e.message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  "clear_context",
  "Reset the context to empty/default state.",
  {},
  async () => {
    await manager.clearContext();
    return {
      content: [{ type: "text", text: "Context cleared." }],
    };
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Context MCP Server running on stdio");
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().catch((err) => {
    console.error("Fatal error in Context MCP Server:", err);
    process.exit(1);
  });
}
