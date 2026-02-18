import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

interface DifyResponse {
  event: string;
  task_id: string;
  id: string;
  answer: string;
  created_at: number;
  conversation_id: string;
  metadata?: any;
}

class DifyClient {
  private apiUrl: string;
  private defaultApiKey?: string;
  private supervisorApiKey?: string;
  private codingApiKey?: string;

  constructor() {
    this.apiUrl = process.env.DIFY_API_URL || "http://localhost:5001/v1";
    this.defaultApiKey = process.env.DIFY_API_KEY;
    this.supervisorApiKey = process.env.DIFY_SUPERVISOR_API_KEY;
    this.codingApiKey = process.env.DIFY_CODING_API_KEY;
  }

  private getApiKey(type: 'supervisor' | 'coding' | 'default'): string {
    if (type === 'supervisor' && this.supervisorApiKey) return this.supervisorApiKey;
    if (type === 'coding' && this.codingApiKey) return this.codingApiKey;
    if (this.defaultApiKey) return this.defaultApiKey;
    throw new Error(`No API key found for ${type}. Please set Dify API keys in environment.`);
  }

  async executeWorkflow(prompt: string, type: 'supervisor' | 'coding'): Promise<string> {
    const apiKey = this.getApiKey(type);
    const url = `${this.apiUrl}/chat-messages`;

    // Dify Chat API payload
    const body = {
      inputs: {},
      query: prompt,
      response_mode: "blocking",
      conversation_id: "",
      user: "simple-cli-user"
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dify API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as DifyResponse;
      return data.answer;
    } catch (error: any) {
      console.error(`[DifyClient] Error executing workflow:`, error);
      throw error;
    }
  }
}

export class DifyServer {
  private server: McpServer;
  private client: DifyClient;

  constructor() {
    this.server = new McpServer({
      name: "dify-server",
      version: "1.0.0",
    });
    this.client = new DifyClient();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "execute_supervisor_workflow",
      "Delegates a task to the Dify Supervisor Agent. Use this for planning, architectural decisions, and high-level task breakdown.",
      {
        prompt: z.string().describe("The task or question for the Supervisor Agent."),
      },
      async ({ prompt }) => {
        try {
          const answer = await this.client.executeWorkflow(prompt, 'supervisor');
          return {
            content: [{ type: "text", text: answer }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "execute_coding_workflow",
      "Delegates a coding task to the Dify Coding Agent. Use this for implementation, code generation, and specific coding problems.",
      {
        prompt: z.string().describe("The coding task description."),
      },
      async ({ prompt }) => {
        try {
          const answer = await this.client.executeWorkflow(prompt, 'coding');
          return {
            content: [{ type: "text", text: answer }],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Dify MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DifyServer();
  server.run().catch((err) => {
    console.error("Fatal error in Dify MCP Server:", err);
    process.exit(1);
  });
}
