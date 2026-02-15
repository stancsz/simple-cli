import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

async function callAnythingLlm(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const ANYTHING_LLM_API_URL = process.env.ANYTHING_LLM_API_URL || "http://localhost:3001";
  const ANYTHING_LLM_API_KEY = process.env.ANYTHING_LLM_API_KEY;

  const url = `${ANYTHING_LLM_API_URL.replace(/\/$/, "")}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (ANYTHING_LLM_API_KEY) {
    headers["Authorization"] = `Bearer ${ANYTHING_LLM_API_KEY}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Anything LLM API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

export class AnythingLlmServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "anything-llm-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "anything_list_workspaces",
      "List all workspaces in Anything LLM.",
      {},
      async () => {
        const workspaces = await callAnythingLlm("/api/v1/workspaces");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(workspaces, null, 2) }],
        };
      }
    );

    this.server.tool(
      "anything_chat",
      "Send a message to a workspace in Anything LLM.",
      {
        workspace_slug: z.string().describe("The slug of the workspace."),
        message: z.string().describe("The message to send."),
        mode: z.string().optional().describe("Mode (chat or query). Default is chat."),
      },
      async ({ workspace_slug, message, mode }) => {
        const result = await callAnythingLlm(
          `/api/v1/workspace/${workspace_slug}/chat`,
          "POST",
          { message, mode: mode || "chat" },
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
    console.error("Anything LLM MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new AnythingLlmServer().run().catch((error) => {
    console.error("Fatal error in Anything LLM MCP Server:", error);
    process.exit(1);
  });
}
