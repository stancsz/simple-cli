import { MCP } from "../mcp.js";

export class ContextManager {

  async getContext(mcp: MCP, company?: string, query?: string): Promise<string> {
    let contextString = "";

    // 1. Static/Shared Context from context_server
    try {
        const client = mcp.getClient("context_server");
        if (client) {
            const res: any = await client.callTool({ name: "read_context", arguments: {} });
            if (res.content?.[0]?.text) {
                const data = JSON.parse(res.content[0].text);
                if (data.goals?.length) contextString += `## Goals\n${data.goals.map((g:string)=>`- ${g}`).join('\n')}\n\n`;
                if (data.constraints?.length) contextString += `## Constraints\n${data.constraints.map((c:string)=>`- ${c}`).join('\n')}\n\n`;
                if (data.working_memory) contextString += `## Working Memory\n${data.working_memory}\n\n`;
                if (data.company_context) contextString += `## Client Context (Static)\n${data.company_context}\n\n`;
            }
        }
    } catch (e) {
        // console.warn("Failed to load static context:", e);
    }

    // 2. Dynamic RAG Context from brain
    if (company && query) {
        try {
            const brain = mcp.getClient("brain");
            if (brain) {
                const res: any = await brain.callTool({
                    name: "query_company_context",
                    arguments: { company, query }
                });
                if (res.content?.[0]?.text && !res.content[0].text.includes("No relevant")) {
                    contextString += `## Client Context (Relevant)\n${res.content[0].text}\n\n`;
                }
            }
        } catch (e) {
            // console.warn("Failed to load RAG context:", e);
        }
    }

    return contextString;
  }
}
