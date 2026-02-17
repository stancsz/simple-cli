import { MCP } from "../mcp.js";

export class ContextManager {
  async getCurrentContext(query: string, mcp: MCP): Promise<string> {
    const client = mcp.getClient("brain");
    if (!client) {
        // If brain server is not running, we just return empty context
        return "";
    }

    try {
        const timeoutPromise = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 2000)
        );

        const resultPromise = client.callTool({
            name: "query_memory",
            arguments: { query }
        });

        // Race between the tool call and the timeout
        const result: any = await Promise.race([resultPromise, timeoutPromise]);

        if (result && result.content && result.content[0]) {
            return result.content[0].text;
        }
    } catch (e: any) {
        // Log warning but don't crash
        if (e.message !== "Timeout") {
             console.warn(`[ContextManager] Brain memory query failed: ${e.message}`);
        } else {
             console.warn(`[ContextManager] Brain memory query timed out.`);
        }
    }
    return "";
  }
}
