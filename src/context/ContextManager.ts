import { MCP } from "../mcp.js";
import { ContextData, ContextManager as IContextManager, ContextSchema } from "../core/context.js";

export class ContextManager implements IContextManager {
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
  }

  private getClient() {
    const client = this.mcp.getClient("context_server");
    if (!client) {
      throw new Error("Context MCP Server not connected. Ensure 'context_server' is started.");
    }
    return client;
  }

  // Implementation of IContextManager (delegates to MCP server)
  async readContext(lockId?: string, company?: string): Promise<ContextData> {
    const client = this.getClient();
    const result: any = await client.callTool("get_context", {
      company: company || process.env.JULES_COMPANY
    });

    if (result.isError) {
      throw new Error(`Failed to read context: ${result.content[0].text}`);
    }

    const data = JSON.parse(result.content[0].text);
    // Validate and strip extra fields using schema
    return ContextSchema.parse(data);
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string, company?: string): Promise<ContextData> {
    const client = this.getClient();
    const result: any = await client.callTool("update_context", {
      updates: JSON.stringify(updates),
      company: company || process.env.JULES_COMPANY
    });

    if (result.isError) {
      throw new Error(`Failed to update context: ${result.content[0].text}`);
    }

    const data = JSON.parse(result.content[0].text);
    return ContextSchema.parse(data);
  }

  async clearContext(lockId?: string, company?: string): Promise<void> {
    const client = this.getClient();
    await client.callTool("clear_context", {
      company: company || process.env.JULES_COMPANY
    });
  }

  // New High-Level Methods for Long-Term Memory Integration

  /**
   * Loads context and enriches it with relevant past experiences from the Brain.
   */
  async loadContext(taskDescription: string, company?: string): Promise<ContextData & { relevant_past_experiences?: string[] }> {
    const client = this.getClient();

    // Call get_context with query to fetch relevant memories
    const result: any = await client.callTool("get_context", {
        query: taskDescription,
        company: company || process.env.JULES_COMPANY
    });

    if (result.isError) {
         console.warn(`Context load warning: ${result.content[0].text}`);
         // Fallback to basic read if query fails?
         // But if get_context fails, likely read fails too.
         throw new Error(result.content[0].text);
    }

    const data = JSON.parse(result.content[0].text);

    // We trust the server to return the correct structure including relevant_past_experiences
    // Check schema for the context part
    const parsed = ContextSchema.safeParse(data);
    if (!parsed.success) {
        console.warn("Context schema validation failed in loadContext:", parsed.error);
    }

    return data;
  }

  /**
   * Saves the outcome of a task to the Brain and updates local context.
   */
  async saveContext(taskDescription: string, outcome: string, updates: Partial<ContextData> = {}, artifacts: string[] = [], company?: string): Promise<void> {
     // 1. Update context (via MCP)
     await this.updateContext(updates, undefined, company);

     // 2. Store to Brain (via Brain MCP)
     try {
       const brainClient = this.mcp.getClient("brain");
       if (brainClient) {
           await brainClient.callTool({
               name: "brain_store",
               arguments: {
                   taskId: "task-" + Date.now(), // Unique ID
                   request: taskDescription,
                   solution: outcome,
                   artifacts: JSON.stringify(artifacts),
                   company: company || process.env.JULES_COMPANY
               }
           });
       } else {
           console.warn("Brain MCP not connected, skipping memory storage.");
       }
     } catch (e) {
         console.warn("Failed to store brain memory:", e);
     }
  }
}
