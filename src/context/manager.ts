import { join, dirname } from "path";
import { existsSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { lock } from "proper-lockfile";
import { ContextSchema, ContextData, ContextManager as IContextManager } from "../core/context.js";
import { BrainClient } from "../mcp_servers/brain/client.js";

// Helper for deep merging
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

export class AgentContextManager implements IContextManager {
  private contextFile: string;
  private cwd: string;
  private brain: BrainClient;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    const company = process.env.JULES_COMPANY;
    if (company) {
      this.contextFile = join(cwd, ".agent", "companies", company, "context.json");
    } else {
      this.contextFile = join(cwd, ".agent", "context.json");
    }
    this.brain = new BrainClient();
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
    return this.withLock(async () => {
      let fileContext: ContextData | null = null;
      let brainContext: ContextData | null = null;

      // 1. Read from File
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          const json = JSON.parse(content);
          const parsed = ContextSchema.safeParse(json);
          fileContext = parsed.success ? parsed.data : ContextSchema.parse(json);
        } catch { }
      }

      // 2. Read from Brain
      try {
        // Query for memories related to context updates
        const episodes = await this.brain.retrieve_relevant_memories("update context", 10);

        // Filter for valid context payloads and sort by timestamp
        const candidates: ContextData[] = [];
        for (const ep of episodes) {
            try {
                // We expect solution to be the JSON string
                const payload = JSON.parse(ep.agentResponse);
                const parsed = ContextSchema.safeParse(payload);
                if (parsed.success) {
                    candidates.push(parsed.data);
                }
            } catch { }
        }

        // Sort by last_updated (descending)
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                const da = a.last_updated ? new Date(a.last_updated).getTime() : 0;
                const db = b.last_updated ? new Date(b.last_updated).getTime() : 0;
                return db - da;
            });
            brainContext = candidates[0];
        }
      } catch (e) {
          // console.warn("Failed to read from Brain:", e);
      }

      // 3. Compare and return latest
      if (!fileContext && !brainContext) return ContextSchema.parse({});
      if (fileContext && !brainContext) return fileContext;
      if (!fileContext && brainContext) {
          // Sync brain state to file cache
          await writeFile(this.contextFile, JSON.stringify(brainContext, null, 2));
          return brainContext!;
      }

      // Both exist
      const fileDate = fileContext!.last_updated ? new Date(fileContext!.last_updated).getTime() : 0;
      const brainDate = brainContext!.last_updated ? new Date(brainContext!.last_updated).getTime() : 0;

      if (brainDate > fileDate) {
          // Update file cache if brain is newer
          await writeFile(this.contextFile, JSON.stringify(brainContext, null, 2));
          return brainContext!;
      }
      return fileContext!;
    });
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    return this.withLock(async () => {
      let current = {};
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          current = JSON.parse(content);
        } catch { }
      }

      const merged = deepMerge(current, updates);

      const parsed = ContextSchema.safeParse(merged);
      if (!parsed.success) {
          throw new Error(`Invalid context update: ${parsed.error.message}`);
      }

      const finalContext = parsed.data;
      finalContext.last_updated = new Date().toISOString();

      // Write to file
      await writeFile(this.contextFile, JSON.stringify(finalContext, null, 2));

      // Write to Brain asynchronously
      try {
          await this.brain.store_episodic_memory(
              "context_update",
              "update context",
              JSON.stringify(finalContext),
              []
          );
      } catch (e) {
          console.warn("Failed to sync context to Brain:", e);
      }

      return finalContext;
    });
  }

  async clearContext(lockId?: string): Promise<void> {
    return this.withLock(async () => {
       const empty = ContextSchema.parse({});
       empty.last_updated = new Date().toISOString();
       await writeFile(this.contextFile, JSON.stringify(empty, null, 2));

       try {
          await this.brain.store_episodic_memory(
              "context_update",
              "clear context",
              JSON.stringify(empty),
              []
          );
       } catch { }
    });
  }

  async sync_brain(): Promise<void> {
      const ctx = await this.readContext();
      try {
          await this.brain.store_episodic_memory(
              "context_update",
              "sync brain",
              JSON.stringify(ctx),
              []
          );
      } catch (e) {
          console.error("Failed to sync brain:", e);
      }
  }
}
