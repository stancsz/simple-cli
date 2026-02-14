import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";

const MINIMAX_CHAT_TOOL = {
  name: "minimax_chat",
  description:
    "Chat with Minimax models (compatible with Anthropic API). Supports text generation, tool use, and reasoning.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        description: "A list of messages comprising the conversation so far.",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["user", "assistant"] },
            content: {
              oneOf: [
                { type: "string" },
                {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      text: { type: "string" },
                    },
                  },
                },
              ],
            },
          },
          required: ["role", "content"],
        },
      },
      model: {
        type: "string",
        description: "The model to use. Defaults to MiniMax-M2.5.",
        default: "MiniMax-M2.5",
      },
      max_tokens: {
        type: "integer",
        description: "The maximum number of tokens to generate.",
        default: 1024,
      },
      temperature: {
        type: "number",
        description: "Amount of randomness injected into the response.",
        minimum: 0,
        maximum: 1,
      },
      system: {
        type: "string",
        description: "A system prompt to provide context and instructions.",
      },
      tools: {
        type: "array",
        description: "A list of tools the model may call.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            input_schema: { type: "object" },
          },
          required: ["name", "input_schema"],
        },
      },
      tool_choice: {
        type: "object",
        description: "How the model should use the provided tools.",
      },
      top_p: {
        type: "number",
        description: "Nucleus sampling.",
      },
      thinking: {
        type: "object",
        description: "Configuration for reasoning content.",
        properties: {
          type: { type: "string", enum: ["enabled", "disabled"] },
          budget_tokens: { type: "integer" },
        },
      },
      metadata: {
        type: "object",
        description: "Metadata for the request.",
      },
    },
    required: ["messages"],
  },
};

export class MinimaxServer {
  private server: Server;
  private client: Anthropic;

  constructor() {
    this.server = new Server(
      {
        name: "minimax-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error(
        "Warning: MINIMAX_API_KEY (or ANTHROPIC_API_KEY) is not set.",
      );
    }

    this.client = new Anthropic({
      apiKey: apiKey || "dummy", // Prevent crash on init, but calls will fail if invalid
      baseURL: "https://api.minimax.io/anthropic",
    });

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [MINIMAX_CHAT_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "minimax_chat") {
        const args = request.params.arguments as any;

        try {
          // Construct params for Anthropic SDK
          const params: any = {
            model: args.model || "MiniMax-M2.5",
            messages: args.messages,
            max_tokens: args.max_tokens || 1024,
          };

          if (args.temperature !== undefined)
            params.temperature = args.temperature;
          if (args.system) params.system = args.system;
          if (args.tools) params.tools = args.tools;
          if (args.tool_choice) params.tool_choice = args.tool_choice;
          if (args.top_p !== undefined) params.top_p = args.top_p;
          if (args.thinking) params.thinking = args.thinking;
          if (args.metadata) params.metadata = args.metadata;

          const response = await this.client.messages.create(params);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Minimax API Error: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
      throw new Error(`Tool not found: ${request.params.name}`);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Minimax MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new MinimaxServer();
  server.run().catch((err) => {
    console.error("Fatal error in Minimax MCP Server:", err);
    process.exit(1);
  });
}
