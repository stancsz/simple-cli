import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";
import { z } from "zod";

const FetchMarkdownSchema = z.object({
  url: z.string().describe("The URL of the webpage to fetch."),
});

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
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  public async handleCallTool(name: string, args: any) {
    if (name === "fetch_markdown") {
      const parsed = FetchMarkdownSchema.safeParse(args);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
      }
      const { url } = parsed.data;
      try {
        return await this.fetchMarkdown(url);
      } catch (e: any) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch markdown: ${e.message}`,
        );
      }
    }
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
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
