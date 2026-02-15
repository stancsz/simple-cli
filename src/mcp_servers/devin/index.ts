import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.devin.ai/v1";

export class DevinServer {
  private server: McpServer;
  private apiKey: string;

  constructor() {
    this.server = new McpServer({
      name: "devin-server",
      version: "1.0.0",
    });

    this.apiKey = process.env.DEVIN_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: DEVIN_API_KEY environment variable is not set. API calls will fail.");
    }

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "devin_create_session",
      "Start a new Devin session to perform an autonomous coding task.",
      {
        prompt: z.string().describe("The task description for Devin."),
      },
      async ({ prompt }) => {
        if (!this.apiKey) {
          return {
            content: [{ type: "text" as const, text: "Error: DEVIN_API_KEY is not set." }],
            isError: true,
          };
        }
        return await this.createSession(prompt);
      }
    );

    this.server.tool(
      "devin_get_session",
      "Get the status and details of a specific Devin session.",
      {
        session_id: z.string().describe("The ID of the session to retrieve."),
      },
      async ({ session_id }) => {
        if (!this.apiKey) {
          return {
            content: [{ type: "text" as const, text: "Error: DEVIN_API_KEY is not set." }],
            isError: true,
          };
        }
        return await this.getSession(session_id);
      }
    );

    this.server.tool(
      "devin_list_sessions",
      "List recent Devin sessions.",
      {
        limit: z.number().int().optional().default(10).describe("Max number of sessions to return (default 10)."),
      },
      async ({ limit }) => {
        if (!this.apiKey) {
          return {
            content: [{ type: "text" as const, text: "Error: DEVIN_API_KEY is not set." }],
            isError: true,
          };
        }
        return await this.listSessions(limit);
      }
    );
  }

  private async createSession(prompt: string) {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    } as { content: { type: "text"; text: string }[] };
  }

  private async getSession(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    } as { content: { type: "text"; text: string }[] };
  }

  private async listSessions(limit: number = 10) {
    // Assuming GET /sessions lists sessions
    // Note: limit might be a query param
    const response = await fetch(`${API_BASE_URL}/sessions?limit=${limit}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    } as { content: { type: "text"; text: string }[] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Devin MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DevinServer();
  server.run().catch((err) => {
    console.error("Fatal error in Devin MCP Server:", err);
    process.exit(1);
  });
}
