import { MCP } from "../mcp.js";
import { ContextData, ContextManager as IContextManager } from "../core/context.js";

export class ContextManager implements IContextManager {
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
  }

  // Implementation of IContextManager (delegates to MCP server)
  async readContext(lockId?: string, company?: string): Promise<ContextData> {
    const client = this.mcp.getClient("context_server");
    if (!client) {
      // If server is not ready (e.g. during very early startup), return empty.
      // Ideally this shouldn't happen during normal operation.
      return { goals: [], constraints: [], recent_changes: [], active_tasks: [] };
    }

    try {
      const result: any = await client.callTool({
        name: "read_context",
        arguments: { company }
      });
      if (result && result.content && result.content[0]) {
        return JSON.parse(result.content[0].text);
      }
    } catch (e) {
      console.error(`Failed to read context via MCP for company ${company || 'default'}:`, e);
    }
    return { goals: [], constraints: [], recent_changes: [], active_tasks: [] };
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string, company?: string): Promise<ContextData> {
    const client = this.mcp.getClient("context_server");
    if (!client) {
      throw new Error("Context server not available for update.");
    }

    try {
      const result: any = await client.callTool({
        name: "update_context",
        arguments: {
            updates: JSON.stringify(updates),
            company
        }
      });
      if (result && result.content && result.content[0]) {
        return JSON.parse(result.content[0].text);
      }
    } catch (e) {
       console.error(`Failed to update context via MCP:`, e);
       throw e;
    }
    throw new Error("Failed to get response from update_context");
  }

  async clearContext(lockId?: string, company?: string): Promise<void> {
    const client = this.mcp.getClient("context_server");
    if (!client) return;

    try {
      await client.callTool({
        name: "clear_context",
        arguments: { company }
      });
    } catch (e) {
      console.error(`Failed to clear context via MCP:`, e);
    }
  }

  // New High-Level Methods for Long-Term Memory Integration

  /**
   * Loads context and enriches it with relevant past experiences from the Brain.
   */
  async loadContext(taskDescription: string, company?: string): Promise<ContextData & { relevant_past_experiences?: string[] }> {
    // 1. Get base context (from MCP server)
    const context = await this.readContext(undefined, company);

    // 2. Query Brain (Episodic Memory)
    let memories: string[] = [];
    try {
      const brainClient = this.mcp.getClient("brain");
      if (brainClient) {
        const result: any = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: taskDescription,
                company: company || process.env.JULES_COMPANY
            }
        });

        if (result && result.content && result.content[0] && result.content[0].text) {
             const text = result.content[0].text;
             if (!text.includes("No relevant memories found")) {
                 // Split by the separator used in brain.ts
                 memories = text.split("\n\n---\n\n").filter((m: string) => m.trim().length > 0);
             }
        }
      }
    } catch (e) {
      // Brain might be unavailable or errored; proceed with base context but log warning
      console.warn("Failed to query brain memories:", e);
    }

    return {
      ...context,
      relevant_past_experiences: memories
    };
  }

  /**
   * Saves the outcome of a task to the Brain and updates local context.
   */
  async saveContext(taskDescription: string, outcome: string, updates: Partial<ContextData> = {}, artifacts: string[] = [], company?: string): Promise<void> {
     // 1. Update local context (via MCP)
     await this.updateContext(updates, undefined, company);

     // 2. Store to Brain
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
       }
     } catch (e) {
         console.warn("Failed to store brain memory:", e);
     }
  }
}
