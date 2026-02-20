import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

export class DifyServer {
  private server: McpServer;
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.server = new McpServer({
      name: "dify",
      version: "1.0.0",
    });

    this.apiUrl = process.env.DIFY_API_URL || "http://localhost:5001/v1";
    this.apiKey = process.env.DIFY_API_KEY || "";

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "deploy_workflow",
      "Deploy a new agent/workflow to Dify using a JSON configuration.",
      {
        config: z.string().describe("JSON string of the agent configuration (see dify_agent_templates/)."),
        name: z.string().optional().describe("Name of the agent/workflow."),
      },
      async ({ config, name }) => {
        try {
          const parsedConfig = JSON.parse(config);
          const payload = {
            ...parsedConfig,
            name: name || parsedConfig.app?.name || "Untitled Agent",
          };

          // Note: Standard Dify API 'v1' is for execution. App creation usually requires
          // console/management API access or importing DSL.
          // We assume a hypothetical 'POST /apps' or user uses this to update via DSL import.
          // For now, we target a 'create' endpoint pattern.
          const response = await fetch(`${this.apiUrl}/apps`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to deploy workflow: ${response.status} ${response.statusText}\n${errorText}`,
                },
              ],
              isError: true,
            };
          }

          const data = await response.json();
          return {
            content: [
              {
                type: "text",
                text: `Workflow deployed successfully.\nID: ${data.id}\nName: ${data.name || name}`,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error deploying workflow: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "trigger_agent",
      "Trigger a Dify agent with a query and inputs.",
      {
        query: z.string().describe("The user query/message."),
        inputs: z.string().optional().describe("JSON string of inputs variables."),
        user: z.string().optional().default("simple-cli-user").describe("User identifier."),
        conversation_id: z.string().optional().describe("Conversation ID to continue a chat."),
        api_key: z.string().optional().describe("Specific API Key for the agent (overrides default)."),
      },
      async ({ query, inputs, user, conversation_id, api_key }) => {
        try {
          const parsedInputs = inputs ? JSON.parse(inputs) : {};
          const key = api_key || this.apiKey;

          if (!key) {
             return {
                content: [{ type: "text", text: "Error: No API Key provided." }],
                isError: true
             };
          }

          const response = await fetch(`${this.apiUrl}/chat-messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`,
            },
            body: JSON.stringify({
              query,
              inputs: parsedInputs,
              user,
              conversation_id,
              response_mode: "blocking", // We wait for the full response in this tool
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
             return {
              content: [
                {
                  type: "text",
                  text: `Failed to trigger agent: ${response.status} ${response.statusText}\n${errorText}`,
                },
              ],
              isError: true,
            };
          }

          const data = await response.json() as any;
          const answer = data.answer || JSON.stringify(data);

          return {
            content: [
              {
                type: "text",
                text: answer,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error triggering agent: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
        "get_conversation",
        "Retrieve history or details of a conversation.",
        {
            conversation_id: z.string().describe("The conversation ID."),
            user: z.string().optional().default("simple-cli-user"),
            limit: z.number().optional().default(20),
            api_key: z.string().optional().describe("Specific API Key for the agent.")
        },
        async ({ conversation_id, user, limit, api_key }) => {
            try {
                const key = api_key || this.apiKey;
                if (!key) {
                     return { content: [{ type: "text", text: "Error: No API Key provided." }], isError: true };
                }

                // Note: Dify API for messages is usually GET /messages?conversation_id=...
                const response = await fetch(`${this.apiUrl}/messages?conversation_id=${conversation_id}&user=${user}&limit=${limit}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${key}`,
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                     return {
                      content: [
                        {
                          type: "text",
                          text: `Failed to get conversation: ${response.status} ${response.statusText}\n${errorText}`,
                        },
                      ],
                      isError: true,
                    };
                }

                const data = await response.json();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(data, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error getting conversation: ${error.message}` }],
                    isError: true
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
