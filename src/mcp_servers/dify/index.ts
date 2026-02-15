import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

export class DifyServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "dify-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "dify_chat",
      "Send a message to a Dify App (Agent/Chat) and get a response.",
      {
        query: z.string().describe("The user's input message."),
        user: z.string().describe("The user identifier (e.g., user-123)."),
        conversation_id: z.string().optional().describe("The conversation ID to continue a session."),
        inputs: z.record(z.any()).optional().describe("Variable inputs defined in the Dify app."),
      },
      async ({ query, user, conversation_id, inputs }) => {
        return await this.runChat(query, user, conversation_id, inputs);
      }
    );
  }

  async runChat(query: string, user: string, conversation_id?: string, inputs: Record<string, any> = {}) {
    const apiKey = process.env.DIFY_API_KEY;
    if (!apiKey) {
        return {
            content: [{ type: "text" as const, text: "Error: DIFY_API_KEY environment variable is not set." }]
        };
    }

    const baseUrl = process.env.DIFY_API_URL || "https://api.dify.ai/v1";

    try {
        const response = await fetch(`${baseUrl}/chat-messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs,
                query,
                user,
                response_mode: "blocking",
                conversation_id
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                content: [{ type: "text" as const, text: `Dify API Error (${response.status}): ${errorText}` }]
            };
        }

        const data: any = await response.json();
        const answer = data.answer;
        const newConversationId = data.conversation_id;

        return {
            content: [
                { type: "text" as const, text: answer },
                { type: "text" as const, text: `Conversation ID: ${newConversationId}` }
            ]
        };

    } catch (e: any) {
        return {
            content: [{ type: "text" as const, text: `Error calling Dify API: ${e.message}` }]
        };
    }
  }

  async handleCallTool(name: string, args: any) {
    const mcpServer = this.server as any;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
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
