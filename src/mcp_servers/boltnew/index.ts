import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { BoltNewClient } from "./boltnew_client.js";

export class BoltNewServer {
  private server: McpServer;
  private client: BoltNewClient;

  constructor() {
    this.server = new McpServer({
      name: "boltnew-server",
      version: "1.0.0",
    });

    this.client = new BoltNewClient();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "boltnew_generate",
      "Generate a UI component using Bolt.new.",
      {
        description: z.string().describe("Description of the UI component to generate."),
        framework: z.enum(["react", "vue", "svelte", "html"]).optional().describe("Target framework (default: react)."),
      },
      async ({ description, framework }) => {
        try {
          const result = await this.client.generateComponent(description, framework || 'react');
          return {
            content: [
              {
                type: "text",
                text: `Successfully generated component (${result.framework}):\n\n${result.code}\n\nPreview: ${result.previewUrl || 'N/A'}`,
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
      "boltnew_list_frameworks",
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
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Bolt.new MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new BoltNewServer();
  server.run().catch((err) => {
    console.error("Fatal error in Bolt.new MCP Server:", err);
    process.exit(1);
  });
}
