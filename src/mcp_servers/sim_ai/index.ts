import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

async function callSimAi(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  // NOTE: This default URL is speculative. The actual Sim AI API might be different.
  const SIM_AI_API_URL = process.env.SIM_AI_API_URL || "http://localhost:8081";
  const SIM_AI_API_KEY = process.env.SIM_AI_API_KEY;

  const url = `${SIM_AI_API_URL.replace(/\/$/, "")}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (SIM_AI_API_KEY) {
    headers["Authorization"] = `Bearer ${SIM_AI_API_KEY}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Sim AI API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

export class SimAiServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "sim-ai-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    // NOTE: These endpoints are speculative based on typical agent platform APIs.
    this.server.tool(
      "sim_list_agents",
      "List all agents in Sim AI.",
      {},
      async () => {
        // Assuming GET /agents endpoint
        const agents = await callSimAi("/agents");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(agents, null, 2) }],
        };
      }
    );

    this.server.tool(
      "sim_trigger_agent",
      "Trigger an agent execution in Sim AI.",
      {
        agent_id: z.string().describe("ID of the agent to trigger"),
        input: z.record(z.any()).optional().describe("Input parameters for the agent"),
      },
      async ({ agent_id, input }) => {
        // Assuming POST /agents/:id/run endpoint
        const result = await callSimAi(
          `/agents/${agent_id}/run`,
          "POST",
          input || {},
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
    console.error("Sim AI MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new SimAiServer().run().catch((error) => {
    console.error("Fatal error in Sim AI MCP Server:", error);
    process.exit(1);
  });
}
