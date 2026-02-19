import { MCP } from "../mcp.js";
import { ContextData, ContextManager as IContextManager } from "../core/context.js";
import { ContextServer } from "../mcp_servers/context_server.js";

export class ContextManager implements IContextManager {
  private server: ContextServer;
  private mcp: MCP;
  private activeCompany: string | null = null;

  constructor(mcp: MCP) {
    this.mcp = mcp;
    this.server = new ContextServer();
  }

  private getEffectiveCompany(company?: string): string | undefined {
      return company || this.activeCompany || process.env.JULES_COMPANY;
  }

  // Implementation of IContextManager (delegates to server/local file)
  async readContext(lockId?: string, company?: string): Promise<ContextData> {
    return this.server.readContext(lockId, this.getEffectiveCompany(company));
  }

  async updateContext(updates: Partial<ContextData>, lockId?: string, company?: string): Promise<ContextData> {
    return this.server.updateContext(updates, lockId, this.getEffectiveCompany(company));
  }

  async clearContext(lockId?: string, company?: string): Promise<void> {
    return this.server.clearContext(lockId, this.getEffectiveCompany(company));
  }

  // New High-Level Methods for Long-Term Memory Integration

  /**
   * Switches the active company context.
   * This updates the Company Context MCP server and the local state.
   */
  async switchCompany(companyId: string): Promise<void> {
      if (!companyId) throw new Error("Company ID is required");

      const client = this.mcp.getClient("company_context");
      if (!client) {
          console.warn("Company Context MCP server is not available. Switching local context only.");
      } else {
          try {
              const result: any = await client.callTool({
                  name: "switch_company_context",
                  arguments: { company_id: companyId }
              });

              if (result.isError) {
                  throw new Error(result.content[0]?.text || "Unknown error from switch_company_context");
              }
          } catch (e: any) {
              // If the tool fails, we should probably not switch local context?
              // Or should we? The requirements say "updates the runtime context...".
              throw new Error(`Failed to switch company context: ${e.message}`);
          }
      }

      this.activeCompany = companyId;
      // We do NOT update process.env.JULES_COMPANY here to avoid side effects on other components
      // that might assume env var is static or managed by CLI.
      // However, Briefcase updates it.
  }

  /**
   * Loads context and enriches it with relevant past experiences from the Brain.
   */
  async loadContext(taskDescription: string, company?: string): Promise<ContextData & { relevant_past_experiences?: string[] }> {
    const effectiveCompany = this.getEffectiveCompany(company);

    // 1. Get base context (local file)
    const context = await this.readContext(undefined, effectiveCompany);

    // 2. Query Brain (Episodic Memory)
    let memories: string[] = [];
    try {
      const brainClient = this.mcp.getClient("brain");
      if (brainClient) {
        const result: any = await brainClient.callTool({
            name: "brain_query",
            arguments: {
                query: taskDescription,
                company: effectiveCompany
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
     const effectiveCompany = this.getEffectiveCompany(company);

     // 1. Update local context
     await this.updateContext(updates, undefined, effectiveCompany);

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
                   company: effectiveCompany
               }
           });
       }
     } catch (e) {
         console.warn("Failed to store brain memory:", e);
     }
  }
}
