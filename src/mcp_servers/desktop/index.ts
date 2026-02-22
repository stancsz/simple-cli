import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StagehandClient } from "./stagehand_client.js";

const server = new McpServer({
  name: "desktop",
  version: "1.0.0",
});

const client = new StagehandClient();

server.tool(
  "navigate_to",
  "Navigate the browser to a specific URL.",
  {
    url: z.string().url().describe("The URL to navigate to"),
  },
  async ({ url }) => {
    try {
      await client.navigate_to(url);
      return { content: [{ type: "text" as const, text: `Navigated to ${url}` }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "click_element",
  "Click an element on the page identified by a CSS selector.",
  {
    selector: z.string().describe("CSS selector of the element to click"),
  },
  async ({ selector }) => {
    try {
      await client.click_element(selector);
      return { content: [{ type: "text" as const, text: `Clicked element matching selector: ${selector}` }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "type_text",
  "Type text into an input field identified by a CSS selector.",
  {
    selector: z.string().describe("CSS selector of the input field"),
    text: z.string().describe("The text to type"),
  },
  async ({ selector, text }) => {
    try {
      await client.type_text(selector, text);
      return { content: [{ type: "text" as const, text: `Typed text into ${selector}` }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "take_screenshot",
  "Take a screenshot of the current page state.",
  {},
  async () => {
    try {
      const base64Image = await client.take_screenshot();
      return {
        content: [
          {
            type: "image" as const,
            data: base64Image,
            mimeType: "image/png" as const,
          },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  "extract_page_text",
  "Extract the full text content of the current page.",
  {},
  async () => {
    try {
      const text = await client.extract_page_text();
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Desktop MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
