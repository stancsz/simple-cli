import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.devin.ai/v1";

const CREATE_SESSION_TOOL = {
  name: "devin_create_session",
  description: "Start a new Devin session to perform an autonomous coding task.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The task description for Devin.",
      },
    },
    required: ["prompt"],
  },
};

const GET_SESSION_TOOL = {
  name: "devin_get_session",
  description: "Get the status and details of a specific Devin session.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "The ID of the session to retrieve.",
      },
    },
    required: ["session_id"],
  },
};

const LIST_SESSIONS_TOOL = {
  name: "devin_list_sessions",
  description: "List recent Devin sessions.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max number of sessions to return (default 10).",
      },
    },
  },
};

export class DevinServer {
  private server: Server;
  private apiKey: string;

  constructor() {
    this.server = new Server(
      {
        name: "devin-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.apiKey = process.env.DEVIN_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: DEVIN_API_KEY environment variable is not set. API calls will fail.");
    }

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [CREATE_SESSION_TOOL, GET_SESSION_TOOL, LIST_SESSIONS_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.apiKey) {
        return {
          content: [{ type: "text", text: "Error: DEVIN_API_KEY is not set." }],
          isError: true,
        };
      }

      try {
        if (name === "devin_create_session") {
            const params = args as { prompt: string };
            return await this.createSession(params.prompt);
        }
        if (name === "devin_get_session") {
            const params = args as { session_id: string };
            return await this.getSession(params.session_id);
        }
        if (name === "devin_list_sessions") {
            const params = args as { limit?: number };
            return await this.listSessions(params.limit);
        }
        throw new Error(`Tool not found: ${name}`);
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
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
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
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
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private async listSessions(limit: number = 10) {
      // Assuming GET /sessions lists sessions
      const response = await fetch(`${API_BASE_URL}/sessions`, {
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
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
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
