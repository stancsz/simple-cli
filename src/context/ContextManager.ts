import { MCP } from "../mcp.js";

export class ContextManager {
  private mcp: MCP;

  constructor(mcp: MCP) {
    this.mcp = mcp;
  }

  /**
   * Loads relevant context from the Brain based on the query.
   */
  async load(query: string, company?: string): Promise<string> {
    try {
      const client = this.mcp.getClient("brain");
      if (!client) {
        return ""; // Brain not available
      }

      const result: any = await client.callTool({
        name: "brain_query", // Using the primary name
        arguments: {
          query,
          company,
          limit: 3
        }
      });

      if (result && result.content && result.content[0] && result.content[0].text) {
        const text = result.content[0].text;
        if (text.includes("No relevant memories found")) {
            return "";
        }
        return text;
      }
    } catch (e) {
      console.warn("Failed to load context from Brain:", e);
    }
    return "";
  }

  /**
   * Saves the current episode to the Brain.
   */
  async save(taskId: string, request: string, solution: string, artifacts: string[], company?: string): Promise<void> {
    try {
      const client = this.mcp.getClient("brain");
      if (!client) {
        console.warn("Brain client not available for saving context.");
        return;
      }

      await client.callTool({
        name: "brain_store",
        arguments: {
          taskId,
          request,
          solution,
          artifacts: JSON.stringify(artifacts),
          company
        }
      });

    } catch (e) {
      console.error("Failed to save context to Brain:", e);
    }
  }
}
