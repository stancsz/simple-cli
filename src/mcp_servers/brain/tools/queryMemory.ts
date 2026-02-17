import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryEpisodic } from "../storage/episodic.js";
import { querySemantic } from "../storage/semantic.js";

export function registerQueryMemory(server: McpServer) {
  server.tool(
    "brain_query_memory",
    "Query memories from the brain.",
    {
      query: z.string().describe("The search query."),
      type: z.enum(["episodic", "semantic"]).optional().describe("Filter by memory type. If omitted, searches both."),
      limit: z.number().optional().default(5).describe("Max number of results."),
    },
    async ({ query, type, limit }) => {
      try {
        const results: any = {};

        if (!type || type === "episodic") {
            results.episodic = await queryEpisodic(query, limit);
        }

        if (!type || type === "semantic") {
            results.semantic = await querySemantic(query);
        }

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
      } catch (err: any) {
         return {
            content: [{ type: "text", text: `Error querying memory: ${err.message}` }],
            isError: true,
        };
      }
    }
  );
}
