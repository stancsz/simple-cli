import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { V0DevClient } from "./client.js";
import { createLLM } from "../../llm.js";
import { MCP } from "../../mcp.js";

export class V0DevServer {
  private server: McpServer;
  private client: V0DevClient;
  private llm: ReturnType<typeof createLLM>;
  private mcp: MCP;

  constructor() {
    this.server = new McpServer({
      name: "v0dev-server",
      version: "1.0.0",
    });

    this.client = new V0DevClient();
    this.llm = createLLM();
    this.mcp = new MCP();

    this.setupTools();
  }

  private async logToBrain(prompt: string, result: any) {
    try {
      // Initialize MCP client to connect to Brain
      // Note: In production, MCP client might already be initialized or managed globally,
      // but here we ensure it's ready.
      // However, MCP.init() typically connects to all servers defined in mcp.json.
      // This might be heavy if done on every request.
      // But based on Windsurf implementation, it calls init() every time.
      await this.mcp.init();
      const tools = await this.mcp.getTools();
      const logExp = tools.find(t => t.name === 'log_experience');

      if (logExp) {
        await logExp.execute({
          taskId: `v0dev-${result.id || Date.now()}`,
          task_type: 'ui_generation',
          agent_used: 'v0dev_server',
          outcome: 'success',
          summary: `Generated UI component for prompt: "${prompt.substring(0, 50)}..."`,
          artifacts: JSON.stringify({
            id: result.id,
            preview_url: result.preview_url,
            framework: result.framework,
            model: result.model
          })
        });
      }
    } catch (e: any) {
      console.error(`Failed to log to Brain: ${e.message}`);
    }
  }

  private setupTools() {
    this.server.tool(
      "v0dev_generate_component",
      "Generate a UI component using v0.dev based on a text description.",
      {
        prompt: z.string().describe("Description of the UI component to generate."),
        framework: z.enum(["react", "vue", "html"]).optional().describe("Target framework (default: react)."),
      },
      async ({ prompt, framework }) => {
        try {
          const result = await this.client.generateComponent(prompt, framework || 'react');

          // Log to Brain
          await this.logToBrain(prompt, result);

          return {
            content: [
              {
                type: "text",
                text: `Successfully generated component (ID: ${result.id}):\nPreview: ${result.preview_url}\n\n${result.code}`,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error generating component: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "v0dev_list_frameworks",
      "List supported frameworks for UI generation.",
      {},
      async () => {
        try {
          const result = await this.client.listFrameworks();
          return {
            content: [
              {
                type: "text",
                text: `Supported frameworks: ${result.frameworks.join(", ")}`,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing frameworks: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "v0dev_validate_prompt",
      "Check if a prompt is suitable for v0.dev UI generation.",
      {
        prompt: z.string().describe("The prompt to validate."),
      },
      async ({ prompt }) => {
        try {
          const response = await this.llm.generate(
            "You are a validation assistant. Analyze if the following prompt is a request to generate a UI component. Respond with JSON: { \"valid\": boolean, \"reason\": string }.",
            [{ role: "user", content: prompt }]
          );

          let parsed;
          try {
            // Attempt to parse JSON from the response text
            const jsonMatch = response.message.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error("No JSON found in response");
            }
          } catch (e) {
            // Fallback if LLM response isn't clean JSON
            parsed = { valid: false, reason: "Could not parse validation response from LLM." };
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(parsed, null, 2),
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text",
                text: `Error validating prompt: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("v0.dev MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new V0DevServer();
  server.run().catch((err) => {
    console.error("Fatal error in v0.dev MCP Server:", err);
    process.exit(1);
  });
}
