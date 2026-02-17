import { MCP } from "../mcp.js";
import { ContextData, ContextManager as IContextManager } from "../core/context.js";
import { ContextServer } from "../mcp_servers/context_server.js";

export class ContextManager implements IContextManager {
  private server: ContextServer;
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
    this.server = new ContextServer();
  }

  // Implementation of IContextManager (delegates to server/local file)
  async readContext(lockId?: string): Promise<ContextData> {
    return this.server.readContext(lockId);
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string): Promise<ContextData> {
    return this.server.updateContext(updates, lockId);
  }

  async clearContext(lockId?: string): Promise<void> {
    return this.server.clearContext(lockId);
  }

  // New High-Level Methods for Long-Term Memory Integration

  /**
   * Loads context and enriches it with relevant past experiences from the Brain.
   */
  async loadContext(taskDescription: string): Promise<ContextData & { relevant_past_experiences?: string[] }> {
    // 1. Get base context (local file)
    const context = await this.readContext();

    // 2. Query Brain (Episodic Memory)
    let memories: string[] = [];
    try {
      const brainClient = this.mcp.getClient("brain");
      if (brainClient) {
        const result: any = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: taskDescription,
                company: process.env.JULES_COMPANY
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
  async saveContext(taskDescription: string, outcome: string, updates: Partial<ContextData> = {}, artifacts: string[] = []): Promise<void> {
     // 1. Update local context
     await this.updateContext(updates);

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
                   company: process.env.JULES_COMPANY
               }
           });
       }
     } catch (e) {
         console.warn("Failed to store brain memory:", e);
     }
  }
}
