import { ContextSchema, ContextData, ContextManager as IContextManager } from "../core/context.js";
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

export class ContextManager implements IContextManager {
  constructor(private mcp: MCP) {}

  async readContext(lockId?: string): Promise<ContextData> {
    const client = this.mcp.getClient("brain");
    if (!client) {
      console.warn("Brain MCP client not available. Returning empty context.");
      return ContextSchema.parse({});
    }

    try {
      const result: any = await client.callTool({
        name: "brain_retrieve_context",
        arguments: { company: process.env.JULES_COMPANY }
      });

      if (result && result.content && result.content[0]) {
          const text = result.content[0].text;
          try {
            const json = JSON.parse(text);
            const parsed = ContextSchema.safeParse(json);
            if (parsed.success) {
                return parsed.data;
            } else {
                console.warn("Context schema validation failed, returning partial/default:", parsed.error);
                return ContextSchema.parse(json);
            }
          } catch (e) {
             // If text is not JSON (e.g. empty string or error message), return default
             return ContextSchema.parse({});
          }
      }
    } catch (e) {
      console.warn("Failed to read context from brain:", e);
    }
    return ContextSchema.parse({});
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    const current = await this.readContext();
    const merged = deepMerge(current, updates);

    // Validate
    const parsed = ContextSchema.safeParse(merged);
    if (!parsed.success) {
        throw new Error(`Invalid context update: ${parsed.error.message}`);
    }

    const finalContext = parsed.data;
    finalContext.last_updated = new Date().toISOString();

    const client = this.mcp.getClient("brain");
    if (client) {
        try {
            await client.callTool({
                name: "brain_store_context",
                arguments: {
                    context: JSON.stringify(finalContext),
                    company: process.env.JULES_COMPANY
                }
            });
        } catch (e) {
             console.warn("Failed to store context to brain:", e);
             throw e;
        }
    } else {
        throw new Error("Brain MCP client not available for context update.");
    }

    return finalContext;
  }

  async clearContext(lockId?: string): Promise<void> {
      const empty = ContextSchema.parse({});
      const client = this.mcp.getClient("brain");
      if (client) {
        await client.callTool({
            name: "brain_store_context",
            arguments: {
                context: JSON.stringify(empty),
                company: process.env.JULES_COMPANY
            }
        });
      }
  }
}
