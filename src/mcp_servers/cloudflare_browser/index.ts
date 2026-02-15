import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

export class CloudflareBrowserServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "cloudflare-browser",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "fetch_markdown",
      "Fetches the markdown version of a webpage using Cloudflare's 'Markdown for Agents'.",
      {
        url: z.string().describe("The URL of the webpage to fetch."),
      },
      async ({ url }) => {
        return await this.fetchMarkdown(url);
      }
    );
  }

  public async fetchMarkdown(url: string) {
    console.error(`Fetching markdown for ${url}...`);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/markdown",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const tokens = response.headers.get("x-markdown-tokens");

      let resultText = text;
      if (tokens) {
        resultText = `Token Count: ${tokens}\n\n${text}`;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: resultText,
          },
        ],
      } as { content: { type: "text"; text: string }[] };
    } catch (e: any) {
      throw new Error(`Failed to fetch markdown: ${e.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Cloudflare Browser MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CloudflareBrowserServer();
  server.run().catch((err) => {
    console.error("Fatal error in Cloudflare Browser MCP Server:", err);
    process.exit(1);
  });
}
