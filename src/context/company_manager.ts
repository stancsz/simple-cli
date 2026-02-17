import { ContextManager, ContextData, ContextSchema } from "../core/context.js";
import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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

export class CompanyLoader {
    private baseDir: string;

    constructor(baseDir: string = process.cwd()) {
        this.baseDir = baseDir;
    }

    getCompanyDBPath(company: string): string {
        return join(this.baseDir, ".agent", "companies", company, "vector.db");
    }

    ensureCompanyDir(company: string) {
        const path = this.getCompanyDBPath(company);
        if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
        }
        return path;
    }
}

export class CompanyManager implements ContextManager {
    private contextFile: string;

    constructor(company: string, cwd: string = process.cwd()) {
        this.contextFile = join(cwd, ".agent", "companies", company, "context.json");
    }

    // Internal lock wrapper
    private async withLock<T>(action: () => Promise<T>): Promise<T> {
        // Ensure directory exists
        if (!existsSync(dirname(this.contextFile))) {
            mkdirSync(dirname(this.contextFile), { recursive: true });
        }
        // Ensure file exists for locking
        if (!existsSync(this.contextFile)) {
             writeFileSync(this.contextFile, "{}");
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
          if (existsSync(this.contextFile)) {
            try {
              const content = readFileSync(this.contextFile, "utf-8");
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

    async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
        return this.withLock(async () => {
          let current = {};
          if (existsSync(this.contextFile)) {
            try {
              const content = readFileSync(this.contextFile, "utf-8");
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

          writeFileSync(this.contextFile, JSON.stringify(finalContext, null, 2));
          return finalContext;
        });
    }

    async clearContext(lockId?: string): Promise<void> {
        return this.withLock(async () => {
           const empty = ContextSchema.parse({});
           writeFileSync(this.contextFile, JSON.stringify(empty, null, 2));
        });
    }
}
