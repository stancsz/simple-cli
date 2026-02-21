import { MCP } from "../mcp.js";
import { ContextData, ContextManager as IContextManager } from "../core/context.js";
import { ContextServer } from "../mcp_servers/context_server.js";
import { randomUUID } from "crypto";

export class ContextManager implements IContextManager {
  private server: ContextServer;
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
    this.server = new ContextServer();
  }

  // Implementation of IContextManager (delegates to server/local file)
  async readContext(lockId?: string, company?: string): Promise<ContextData> {
    return this.server.readContext(lockId, company);
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string, company?: string): Promise<ContextData> {
    return this.server.updateContext(updates, lockId, company);
  }

  async clearContext(lockId?: string, company?: string): Promise<void> {
    return this.server.clearContext(lockId, company);
  }

  // New High-Level Methods for Long-Term Memory Integration

  /**
   * Loads context and enriches it with relevant past experiences from the Brain.
   * This method integrates the Brain MCP server to recall similar past episodes.
   */
  async loadContext(taskDescription: string, company?: string): Promise<ContextData & { relevant_past_experiences?: string[] }> {
    // 1. Get base context (local file)
    const context = await this.readContext(undefined, company);

    // 2. Query Brain (Episodic Memory) - INTEGRATED
    let memories: string[] = [];
    try {
      const brainClient = this.mcp.getClient("brain");
      if (brainClient) {
        // Execute brain_query to retrieve relevant past experiences
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
                 // Split by the separator used in brain.ts and filter empty strings
                 memories = text.split("\n\n---\n\n").filter((m: string) => m.trim().length > 0);
             }
        }
      }
    } catch (e) {
      // Brain might be unavailable or errored; proceed with base context but log warning to avoid blocking
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
     // 1. Update local context
     await this.updateContext(updates, undefined, company);

     // 2. Store to Brain - INTEGRATED
     try {
       const brainClient = this.mcp.getClient("brain");
       if (brainClient) {
           const taskId = randomUUID();
           const companyId = company || process.env.JULES_COMPANY;

           // A. Store Episodic Memory via brain_store tool
           await brainClient.callTool({
               name: "brain_store",
               arguments: {
                   taskId: taskId,
                   request: taskDescription,
                   solution: outcome,
                   artifacts: JSON.stringify(artifacts),
                   company: companyId
               }
           });

           // B. Link Artifacts in Semantic Graph
           // Create Task Node
           try {
             await brainClient.callTool({
               name: "brain_update_graph",
               arguments: {
                 operation: "add_node",
                 args: JSON.stringify({ id: taskId, type: "task", properties: { description: taskDescription, outcome } }),
                 company: companyId
               }
             });

             // Link each artifact
             for (const artifact of artifacts) {
               // Create File Node (if not exists, or update)
               await brainClient.callTool({
                 name: "brain_update_graph",
                 arguments: {
                   operation: "add_node",
                   args: JSON.stringify({ id: artifact, type: "file" }),
                   company: companyId
                 }
               });

               // Create Edge: Task -> Modifies -> File
               await brainClient.callTool({
                 name: "brain_update_graph",
                 arguments: {
                   operation: "add_edge",
                   args: JSON.stringify({ from: taskId, to: artifact, relation: "modifies" }),
                   company: companyId
                 }
               });
             }
           } catch (graphError) {
             console.warn("Failed to update semantic graph:", graphError);
             // Non-critical, do not fail the whole save
           }
       }
     } catch (e) {
         console.warn("Failed to store brain memory:", e);
     }
  }
}
