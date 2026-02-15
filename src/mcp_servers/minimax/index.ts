import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";

export class MinimaxServer {
  private server: McpServer;
  private client: Anthropic;

  constructor() {
    this.server = new McpServer({
      name: "minimax-server",
      version: "1.0.0",
    });

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

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "minimax_chat",
      "Chat with Minimax models (compatible with Anthropic API). Supports text generation, tool use, and reasoning.",
      {
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.union([
              z.string(),
              z.array(
                z.object({
                  type: z.string(),
                  text: z.string().optional(),
                  // Add more fields if needed for complex contents like images/tool calls
                }).passthrough()
              ),
            ]),
          })
        ).describe("A list of messages comprising the conversation so far."),
        model: z.string().default("MiniMax-M2.5").describe("The model to use. Defaults to MiniMax-M2.5."),
        max_tokens: z.number().int().default(1024).describe("The maximum number of tokens to generate."),
        temperature: z.number().min(0).max(1).optional().describe("Amount of randomness injected into the response."),
        system: z.string().optional().describe("A system prompt to provide context and instructions."),
        tools: z.array(z.any()).optional().describe("A list of tools the model may call."),
        tool_choice: z.any().optional().describe("How the model should use the provided tools."),
        top_p: z.number().optional().describe("Nucleus sampling."),
        thinking: z.object({
          type: z.enum(["enabled", "disabled"]),
          budget_tokens: z.number().int(),
        }).optional().describe("Configuration for reasoning content."),
        metadata: z.record(z.any()).optional().describe("Metadata for the request."),
      },
      async (args) => {
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
           throw error;
        }
      }
    );
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
