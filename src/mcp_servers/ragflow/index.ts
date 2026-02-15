import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

async function callRagFlow(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const RAGFLOW_API_URL = process.env.RAGFLOW_API_URL || "http://localhost:9380";
  const RAGFLOW_API_KEY = process.env.RAGFLOW_API_KEY;

  const url = `${RAGFLOW_API_URL.replace(/\/$/, "")}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (RAGFLOW_API_KEY) {
    headers["Authorization"] = `Bearer ${RAGFLOW_API_KEY}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `RAGFlow API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

export class RagFlowServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "ragflow-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "ragflow_list_knowledge_bases",
      "List all knowledge bases in RAGFlow.",
      {},
      async () => {
        const kbs = await callRagFlow("/api/v1/kb/list");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(kbs, null, 2) }],
        };
      }
    );

    this.server.tool(
      "ragflow_query",
      "Query a knowledge base in RAGFlow.",
      {
        kb_id: z.string().describe("ID of the knowledge base to query."),
        query: z.string().describe("The search query."),
        top_k: z.number().optional().describe("Number of results to return."),
      },
      async ({ kb_id, query, top_k }) => {
        const result = await callRagFlow(
          "/api/v1/retrieval",
          "POST",
          { kb_id, query, top_k },
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("RAGFlow MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new RagFlowServer().run().catch((error) => {
    console.error("Fatal error in RAGFlow MCP Server:", error);
    process.exit(1);
  });
}
