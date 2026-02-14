import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

const FETCH_MARKDOWN_TOOL = {
  name: "fetch_markdown",
  description:
    "Fetches the markdown version of a webpage using Cloudflare's 'Markdown for Agents'.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the webpage to fetch.",
      },
    },
    required: ["url"],
  },
};

export class CloudflareBrowserServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "cloudflare-browser",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [FETCH_MARKDOWN_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === "fetch_markdown") {
          const args = request.params.arguments as { url?: string };
          if (!args || typeof args.url !== "string") {
            throw new Error("Invalid arguments: 'url' string is required");
          }
          return await this.fetchMarkdown(args.url);
        }
        throw new Error(`Tool not found: ${request.params.name}`);
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${e.message}`,
            },
          ],
          isError: true,
        };
      }
    });
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
            type: "text",
            text: resultText,
          },
        ],
      };
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
