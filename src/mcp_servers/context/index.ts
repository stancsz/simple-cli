import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { randomUUID } from "crypto";
import { lock } from "proper-lockfile";

// Helper for deep merge
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

export class ContextManager {
  private contextFile: string;
  private brainClient: Client | null = null;
  private cwd: string;
  private activeLocks: Map<string, () => Promise<void>> = new Map();

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    const company = process.env.JULES_COMPANY;
    if (company) {
      this.contextFile = join(cwd, ".agent", "companies", company, "context.json");
    } else {
      this.contextFile = join(cwd, ".agent", "context.json");
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
      console.warn(`Failed to connect to Brain MCP server at ${url}. Ensure it is running.`);
      throw e;
    }
  }

  // Internal lock helper (waits for lock or uses active lock)
  private async withLock<T>(action: () => Promise<T>, lockId?: string): Promise<T> {
    if (lockId && this.activeLocks.has(lockId)) {
      // Re-entrant: we hold the lock via this instance
      return await action();
    }

    // Ensure directory exists before locking
    if (!existsSync(dirname(this.contextFile))) {
        await mkdir(dirname(this.contextFile), { recursive: true });
    }
    // Ensure file exists (proper-lockfile needs file or dir, usually file)
    // Actually proper-lockfile locks the file. If file doesn't exist, it might fail?
    // Doc says: "lockfile.lock(file, [options])".
    // If file doesn't exist, we should probably create an empty one first?
    if (!existsSync(this.contextFile)) {
         await writeFile(this.contextFile, "{}");
    }

    let release: () => Promise<void>;
    try {
        release = await lock(this.contextFile, {
            retries: { retries: 100, minTimeout: 100 }, // 10s roughly
            stale: 30000
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

  // Explicit lock tools
  async acquireLock(): Promise<string | null> {
    // Ensure directory/file exists
    if (!existsSync(dirname(this.contextFile))) {
        await mkdir(dirname(this.contextFile), { recursive: true });
    }
    if (!existsSync(this.contextFile)) {
         await writeFile(this.contextFile, "{}");
    }

    try {
      const release = await lock(this.contextFile, { retries: 0, stale: 30000 });
      const lockId = randomUUID();
      this.activeLocks.set(lockId, release);
      return lockId;
    } catch (e: any) {
      if (e.code === 'ELOCKED') return null;
      // proper-lockfile might throw other errors
      if (e.message && e.message.includes('locked')) return null;
      throw e;
    }
  }

  async releaseLock(lockId?: string): Promise<boolean> {
    if (!lockId) return false;
    const release = this.activeLocks.get(lockId);
    if (!release) return false;

    try {
        await release();
    } catch {
        // Ignore error during release (e.g. if file gone)
    }
    this.activeLocks.delete(lockId);
    return true;
  }

  async readContext(lockId?: string): Promise<any> {
    return this.withLock(async () => {
      if (existsSync(this.contextFile)) {
        const content = await readFile(this.contextFile, "utf-8");
        try {
          return JSON.parse(content);
        } catch {
          return {};
        }
      }
      return {};
    }, lockId);
  }

  async updateContext(updates: any, lockId?: string): Promise<any> {
    return this.withLock(async () => {
      let current = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch {
          // ignore corrupted file
        }
      }
      const validUpdates = typeof updates === 'string' ? JSON.parse(updates) : updates;
      const merged = deepMerge(current, validUpdates);

      await mkdir(dirname(this.contextFile), { recursive: true });
      await writeFile(this.contextFile, JSON.stringify(merged, null, 2));
      return merged;
    }, lockId);
  }

  async logChange(change: string, lockId?: string): Promise<void> {
    await this.withLock(async () => {
      let current: any = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }
      if (!current.recent_changes) current.recent_changes = [];
      if (!Array.isArray(current.recent_changes)) current.recent_changes = [];

      current.recent_changes.push(change);
      // Keep only last 10 changes
      if (current.recent_changes.length > 10) {
        current.recent_changes = current.recent_changes.slice(-10);
      }

      await mkdir(dirname(this.contextFile), { recursive: true });
      await writeFile(this.contextFile, JSON.stringify(current, null, 2));

      // Sync to Brain
      try {
        const brain = await this.getBrain();
        await brain.callTool({
          name: "store_memory",
          arguments: {
            userPrompt: "System Log",
            agentResponse: `Change: ${change}`,
            artifacts: JSON.stringify([]) // No artifacts
          }
        });
      } catch (e) {
        console.warn("Failed to sync change to brain:", e);
      }
    }, lockId);
  }

  async addGoal(goal: string, lockId?: string): Promise<void> {
    await this.withLock(async () => {
      let current: any = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }
      if (!current.goals) current.goals = [];
      if (!Array.isArray(current.goals)) current.goals = [];

      if (!current.goals.includes(goal)) {
        current.goals.push(goal);
        await mkdir(dirname(this.contextFile), { recursive: true });
        await writeFile(this.contextFile, JSON.stringify(current, null, 2));

        // Sync to Brain
        try {
          const brain = await this.getBrain();
          await brain.callTool({
            name: "store_memory",
            arguments: {
              userPrompt: "System Log",
              agentResponse: `Goal: ${goal}`,
              artifacts: JSON.stringify([])
            }
          });
        } catch (e) {
            console.warn("Failed to sync goal to brain:", e);
        }
      }
    }, lockId);
  }

  async addConstraint(constraint: string, lockId?: string): Promise<void> {
    await this.withLock(async () => {
      let current: any = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }
      if (!current.constraints) current.constraints = [];
      if (!Array.isArray(current.constraints)) current.constraints = [];

      if (!current.constraints.includes(constraint)) {
        current.constraints.push(constraint);
        await mkdir(dirname(this.contextFile), { recursive: true });
        await writeFile(this.contextFile, JSON.stringify(current, null, 2));

        // Sync to Brain
        try {
          const brain = await this.getBrain();
          await brain.callTool({
            name: "store_memory",
            arguments: {
              userPrompt: "System Log",
              agentResponse: `Constraint: ${constraint}`,
              artifacts: JSON.stringify([])
            }
          });
        } catch (e) {
            console.warn("Failed to sync constraint to brain:", e);
        }
      }
    }, lockId);
  }

  async getContextSummary(lockId?: string): Promise<string> {
    return this.withLock(async () => {
      let current: any = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }
      const parts: string[] = [];

      if (current.goals && current.goals.length > 0) {
        parts.push(
          "## Current Goals\n" +
          current.goals.map((g: string) => `- ${g}`).join("\n"),
        );
      }

      if (current.constraints && current.constraints.length > 0) {
        parts.push(
          "## Constraints & Guidelines\n" +
          current.constraints.map((c: string) => `- ${c}`).join("\n"),
        );
      }

      if (current.recent_changes && current.recent_changes.length > 0) {
        parts.push(
          "## Recent Architectural Changes\n" +
          current.recent_changes.map((c: string) => `- ${c}`).join("\n"),
        );
      }

      return parts.join("\n\n");
    }, lockId);
  }

  async searchMemory(query: string, limit: number = 5): Promise<string> {
    try {
      const brain = await this.getBrain();
      const result: any = await brain.callTool({
        name: "query_memory",
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

  async storeMemory(userPrompt: string, agentResponse: string, artifacts: string[]): Promise<void> {
    try {
      const brain = await this.getBrain();
      await brain.callTool({
        name: "store_memory",
        arguments: {
            userPrompt,
            agentResponse,
            artifacts: JSON.stringify(artifacts)
        }
      });
    } catch (e) {
      console.warn("Failed to add memory to brain:", e);
    }
  }
}

const server = new McpServer({
  name: "context",
  version: "1.0.0",
});

const manager = new ContextManager();

server.tool(
  "read_context",
  "Read the current context.json",
  {
      lockId: z.string().optional().describe("Lock ID if lock was acquired via lock_context")
  },
  async ({ lockId }) => {
    const context = await manager.readContext(lockId);
    return {
      content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
    };
  }
);

server.tool(
  "update_context",
  "Update the context.json with partial updates (deep merged)",
  {
    updates: z.string().describe("JSON string of updates to merge"),
    lockId: z.string().optional().describe("Lock ID if lock was acquired via lock_context")
  },
  async ({ updates, lockId }) => {
    let parsedUpdates;
    try {
      parsedUpdates = JSON.parse(updates);
    } catch (e) {
      return {
        content: [{ type: "text", text: "Error: updates must be valid JSON string" }],
        isError: true
      };
    }
    const newContext = await manager.updateContext(parsedUpdates, lockId);
    return {
      content: [{ type: "text", text: JSON.stringify(newContext, null, 2) }],
    };
  }
);

server.tool(
  "lock_context",
  "Acquire or release the lock for context.json",
  {
    action: z.enum(["acquire", "release"]).describe("Action to perform on the lock"),
    lockId: z.string().optional().describe("Lock ID (required for release action)"),
  },
  async ({ action, lockId }) => {
    if (action === "acquire") {
      const newLockId = await manager.acquireLock();
      if (newLockId) {
        return { content: [{ type: "text", text: `Lock acquired: ${newLockId}` }] };
      } else {
        return { content: [{ type: "text", text: "Failed to acquire lock (already locked)" }], isError: true };
      }
    } else {
      const success = await manager.releaseLock(lockId);
      if (success) {
        return { content: [{ type: "text", text: "Lock released" }] };
      } else {
        return { content: [{ type: "text", text: "Lock not found or invalid ID" }] };
      }
    }
  }
);

server.tool(
  "search_memory",
  "Search long-term memory via Brain",
  {
    query: z.string().describe("Search query"),
  },
  async ({ query }) => {
    const result = await manager.searchMemory(query);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "store_memory",
  "Store a memory to Brain (user prompt, response, artifacts)",
  {
    userPrompt: z.string().describe("User prompt"),
    agentResponse: z.string().describe("Agent response"),
    artifacts: z.string().optional().describe("JSON string array of artifacts"),
  },
  async ({ userPrompt, agentResponse, artifacts }) => {
    let arts: string[] = [];
    if (artifacts) {
        try {
            arts = JSON.parse(artifacts);
        } catch { arts = []; }
    }
    await manager.storeMemory(userPrompt, agentResponse, arts);
    return { content: [{ type: "text", text: "Memory stored" }] };
  }
);

// New tools exposed
server.tool(
  "add_goal",
  "Add a new high-level goal to context.json and Brain.",
  {
    goal: z.string().describe("Goal text"),
    lockId: z.string().optional().describe("Lock ID if lock was acquired")
  },
  async ({ goal, lockId }) => {
    await manager.addGoal(goal, lockId);
    return { content: [{ type: "text", text: "Goal added" }] };
  }
);

server.tool(
  "add_constraint",
  "Add a new constraint to context.json and Brain.",
  {
    constraint: z.string().describe("Constraint text"),
    lockId: z.string().optional().describe("Lock ID if lock was acquired")
  },
  async ({ constraint, lockId }) => {
    await manager.addConstraint(constraint, lockId);
    return { content: [{ type: "text", text: "Constraint added" }] };
  }
);

server.tool(
  "log_change",
  "Log a recent architectural change to context.json and Brain.",
  {
    change: z.string().describe("Change description"),
    lockId: z.string().optional().describe("Lock ID if lock was acquired")
  },
  async ({ change, lockId }) => {
    await manager.logChange(change, lockId);
    return { content: [{ type: "text", text: "Change logged" }] };
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
