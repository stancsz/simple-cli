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
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  private getContextFile(company?: string): string {
    const targetCompany = company || process.env.JULES_COMPANY;
    if (targetCompany) {
      // Validate company name to prevent path traversal
      if (!/^[a-zA-Z0-9_-]+$/.test(targetCompany)) {
        throw new Error("Invalid company name.");
      }
      return join(this.cwd, ".agent", "companies", targetCompany, "context.json");
    }
    return join(this.cwd, ".agent", "context.json");
  }

  // Internal lock wrapper
  private async withLock<T>(company: string | undefined, action: (file: string) => Promise<T>): Promise<T> {
    const contextFile = this.getContextFile(company);

    // Ensure directory exists
    if (!existsSync(dirname(contextFile))) {
      await mkdir(dirname(contextFile), { recursive: true });
    }
    // Ensure file exists for locking
    if (!existsSync(contextFile)) {
      await writeFile(contextFile, "{}");
    }

    let release: () => Promise<void>;
    try {
      release = await lock(contextFile, {
        retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 },
        stale: 10000
      });
    } catch (e: any) {
      throw new Error(`Failed to acquire lock for ${contextFile}: ${e.message}`);
    }

    try {
      return await action(contextFile);
    } finally {
      await release();
    }
  }

  async readContext(lockId?: string, company?: string): Promise<ContextData> {
    return this.withLock(company, async (file) => {
      if (existsSync(file)) {
        try {
          const content = await readFile(file, "utf-8");
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

  async updateContext(updates: Partial<ContextData>, lockId?: string, company?: string): Promise<ContextData> {
    return this.withLock(company, async (file) => {
      let current = {};
      if (existsSync(file)) {
        try {
          const content = await readFile(file, "utf-8");
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

      await writeFile(file, JSON.stringify(finalContext, null, 2));
      return finalContext;
    });
  }

  async clearContext(lockId?: string, company?: string): Promise<void> {
    return this.withLock(company, async (file) => {
      const empty = ContextSchema.parse({});
      await writeFile(file, JSON.stringify(empty, null, 2));
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
  {
    company: z.string().optional().describe("Company ID to read context for (optional)."),
  },
  async ({ company }) => {
    const context = await manager.readContext(undefined, company);
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
    company: z.string().optional().describe("Company ID to update context for (optional)."),
  },
  async ({ updates, company }) => {
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
      const newContext = await manager.updateContext(parsedUpdates, undefined, company);
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
  {
    company: z.string().optional().describe("Company ID to clear context for (optional)."),
  },
  async ({ company }) => {
    await manager.clearContext(undefined, company);
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
