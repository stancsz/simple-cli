import { ContextSchema, ContextData, ContextManager as IContextManager } from "../core/context.js";
import { MCP } from "../mcp.js";
import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
// @ts-ignore
import { lock } from "proper-lockfile";

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

export class ContextManager implements IContextManager {
  private contextFile: string;
  private mcp?: MCP;
  private company?: string;

  constructor(mcp?: MCP, company?: string, cwd: string = process.cwd()) {
    this.mcp = mcp;
    this.company = company || process.env.JULES_COMPANY;

    if (this.company) {
      this.contextFile = join(cwd, ".agent", "companies", this.company, "context.json");
    } else {
      this.contextFile = join(cwd, ".agent", "context.json");
    }
  }

  // Internal lock wrapper
  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    if (!existsSync(dirname(this.contextFile))) {
      await mkdir(dirname(this.contextFile), { recursive: true });
    }
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
    return this.load();
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    return this.update(updates);
  }

  async clearContext(lockId?: string): Promise<void> {
    return this.clear();
  }

  async load(): Promise<ContextData> {
    // 1. Try to load from Brain
    if (this.mcp) {
      try {
        const client = this.mcp.getClient("brain");
        if (client) {
            const result: any = await client.callTool({
                name: "brain_get_context",
                arguments: { company: this.company }
            });

            if (result && result.content && result.content[0] && !result.isError) {
                const text = result.content[0].text;
                if (text && !text.includes("No context found")) {
                     const json = JSON.parse(text);
                     const parsed = ContextSchema.safeParse(json);
                     if (parsed.success) {
                         // Cache to local file
                         await this.saveLocal(parsed.data);
                         return parsed.data;
                     }
                }
            }
        }
      } catch (e) {
        // Fallback to local
        // console.warn("Failed to load context from Brain, falling back to local file.", e);
      }
    }

    // 2. Fallback to local file
    return this.loadLocal();
  }

  async save(context: ContextData): Promise<void> {
      // 1. Save to local file
      await this.saveLocal(context);

      // 2. Sync to Brain
      if (this.mcp) {
          try {
              const client = this.mcp.getClient("brain");
              if (client) {
                  await client.callTool({
                      name: "brain_store_context",
                      arguments: {
                          context: JSON.stringify(context),
                          company: this.company
                      }
                  });
              }
          } catch (e) {
              console.warn("Failed to sync context to Brain:", e);
          }
      }
  }

  // Local file operations
  private async loadLocal(): Promise<ContextData> {
    return this.withLock(async () => {
      if (existsSync(this.contextFile)) {
        try {
          const content = await readFile(this.contextFile, "utf-8");
          const json = JSON.parse(content);
          const parsed = ContextSchema.safeParse(json);
           if (parsed.success) {
            return parsed.data;
          } else {
             return ContextSchema.parse(json);
          }
        } catch {
          return ContextSchema.parse({});
        }
      }
      return ContextSchema.parse({});
    });
  }

  private async saveLocal(context: ContextData): Promise<void> {
      return this.withLock(async () => {
          await writeFile(this.contextFile, JSON.stringify(context, null, 2));
      });
  }

  async update(updates: Partial<ContextData>): Promise<ContextData> {
      const current = await this.load(); // Try Brain first, then local
      const merged = deepMerge(current, updates);

      const parsed = ContextSchema.safeParse(merged);
      if (!parsed.success) {
        throw new Error(`Invalid context update: ${parsed.error.message}`);
      }

      const finalContext = parsed.data;
      finalContext.last_updated = new Date().toISOString();

      await this.save(finalContext); // Save to Brain and local
      return finalContext;
  }

  async clear(): Promise<void> {
      const empty = ContextSchema.parse({});
      await this.save(empty);
  }
}
