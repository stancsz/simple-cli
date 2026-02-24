import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import "dotenv/config";

// TODO: [Ingest] This is the "Correct" Kimi implementation.
// It uses the Kimi K2.5 reasoning model natively instead of a fake CrewAI wrapper.
// It leverages Moonshot AI's native 'Interleaved Thinking' capability.

export class KimiServer {
  private server: McpServer;
  private model: any;

  constructor() {
    this.server = new McpServer({
      name: "kimi-server",
      version: "1.0.0",
    });

    const apiKey = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY;
    const baseURL = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1";

    if (apiKey) {
      this.model = createOpenAI({
        apiKey,
        baseURL,
      })("kimi-k2.5");
    }

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "kimi_agent",
      "Delegate a complex task to the Kimi K2.5 reasoning agent. Kimi K2.5 is optimized for deep reasoning, coding, and multi-step planning.",
      {
        task: z.string().describe("The task description for Kimi."),
        context: z.string().optional().describe("Optional context about the project or files."),
      },
      async ({ task, context }) => {
        if (!this.model) {
          return {
            content: [{ type: "text", text: "Error: MOONSHOT_API_KEY or KIMI_API_KEY is not set." }],
            isError: true,
          };
        }

        try {
          const system = `You are Kimi, a powerful AI assistant created by Moonshot AI.
You are running as a specialized agent within Simple Biosphere.
You have access to deep reasoning (Thinking Mode).
Analyze the task carefully, think through the solution, and provide a comprehensive response.
If the task involves code, provide high-quality, production-ready code.

Task: ${task}
${context ? `Context: ${context}` : ""}`;

          const { text, response } = await generateText({
            model: this.model,
            system: "You are Kimi, an AI assistant created by Moonshot AI.",
            prompt: task,
          });

          // Extract reasoning content if available (Moonshot API specific)
          // Note: The 'ai' SDK might not expose reasoning_content directly for Moonshot yet,
          // but we can try to find it in the raw response or just use the generated text.
          const reasoning = (response as any).rawResponse?.choices?.[0]?.message?.reasoning_content;

          return {
            content: [
              {
                type: "text",
                text: reasoning ? `[Kimi Thinking]\n${reasoning}\n\n[Kimi Result]\n${text}` : text,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Kimi API Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Kimi K2.5 MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new KimiServer();
  server.run().catch((err) => {
    console.error("Fatal error in Kimi MCP Server:", err);
    process.exit(1);
  });
}
