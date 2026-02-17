import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storeEpisodic } from "../storage/episodic.js";
import { storeSemantic } from "../storage/semantic.js";

export function registerStoreMemory(server: McpServer) {
  server.tool(
    "brain_store_memory",
    "Store a memory in the brain (episodic or semantic).",
    {
      content: z.string().describe("The content of the memory."),
      type: z.enum(["episodic", "semantic"]).describe("The type of memory."),
      embedding: z.array(z.number()).optional().describe("The vector embedding of the content (optional)."),
      metadata: z.record(z.any()).optional().describe("Additional metadata for the memory (e.g., taskId, solution for episodic; id, type, properties for semantic)."),
    },
    async ({ content, type, embedding, metadata }) => {
      try {
        if (type === "episodic") {
          await storeEpisodic(content, embedding, metadata);
        } else {
          await storeSemantic(content, metadata);
        }
        return {
          content: [{ type: "text", text: `Memory stored successfully as ${type}.` }],
        };
      } catch (err: any) {
        return {
            content: [{ type: "text", text: `Error storing memory: ${err.message}` }],
            isError: true,
        };
      }
    }
  );
}
