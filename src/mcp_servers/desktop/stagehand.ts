import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

export class StagehandServer {
  private server: McpServer;
  private stagehand: Stagehand | null = null;
  private page: any = null;

  constructor() {
    this.server = new McpServer({
      name: "desktop",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private async initStagehand() {
    if (!this.stagehand) {
      console.error("Initializing Stagehand...");
      this.stagehand = new Stagehand({
        env: (process.env.STAGEHAND_ENV as any) || "LOCAL",
        verbose: (process.env.STAGEHAND_VERBOSE ? parseInt(process.env.STAGEHAND_VERBOSE) : 1) as 0 | 1 | 2,
        localBrowserLaunchOptions: {
          headless: process.env.HEADLESS === "true",
        },
      });
      await this.stagehand.init();
      this.page = (this.stagehand as any).page;

      if (process.env.VIEWPORT_WIDTH && process.env.VIEWPORT_HEIGHT) {
        await this.page.setViewportSize({
          width: parseInt(process.env.VIEWPORT_WIDTH),
          height: parseInt(process.env.VIEWPORT_HEIGHT),
        });
      }
      console.error("Stagehand initialized.");
    }
  }

  private setupTools() {
    this.server.tool(
      "desktop_navigate",
      "Navigate to a URL.",
      { url: z.string().url().describe("The URL to navigate to") },
      async ({ url }) => {
        try {
          await this.initStagehand();
          console.error(`Navigating to ${url}...`);
          await this.page.goto(url, { waitUntil: "domcontentloaded" });
          return { content: [{ type: "text", text: `Navigated to ${url}` }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Error navigating to ${url}: ${(e as Error).message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "desktop_click",
      "Click an element defined by a CSS selector.",
      { selector: z.string().describe("CSS selector of the element to click") },
      async ({ selector }) => {
        try {
          await this.initStagehand();
          console.error(`Clicking element ${selector}...`);
          await this.page.click(selector);
          return { content: [{ type: "text", text: `Clicked element ${selector}` }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Error clicking ${selector}: ${(e as Error).message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "desktop_type",
      "Type text into an element defined by a CSS selector.",
      {
        selector: z.string().describe("CSS selector of the element to type into"),
        text: z.string().describe("The text to type")
      },
      async ({ selector, text }) => {
        try {
          await this.initStagehand();
          console.error(`Typing "${text}" into ${selector}...`);
          await this.page.fill(selector, text);
          return { content: [{ type: "text", text: `Typed text into ${selector}` }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Error typing into ${selector}: ${(e as Error).message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "desktop_screenshot",
      "Take a screenshot of the current page.",
      {},
      async () => {
        try {
          await this.initStagehand();
          console.error("Taking screenshot...");
          const buffer = await this.page.screenshot({ fullPage: true });
          return {
            content: [
              {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        } catch (e) {
          return { content: [{ type: "text", text: `Error taking screenshot: ${(e as Error).message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "desktop_extract",
      "Extract text content from an element (or the full page).",
      { selector: z.string().optional().describe("CSS selector to extract text from. If omitted, extracts full page text.") },
      async ({ selector }) => {
        try {
          await this.initStagehand();
          let text = "";
          if (selector) {
            console.error(`Extracting text from ${selector}...`);
            text = (await this.page.textContent(selector)) || "";
          } else {
            console.error("Extracting full page text...");
            text = await this.page.evaluate(() => document.body.innerText);
          }
          return { content: [{ type: "text", text }] };
        } catch (e) {
          return { content: [{ type: "text", text: `Error extracting text: ${(e as Error).message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "desktop_shutdown",
      "Close the browser and release resources.",
      {},
      async () => {
        if (this.stagehand) {
          console.error("Shutting down Stagehand...");
          await this.stagehand.close();
          this.stagehand = null;
          this.page = null;
          return { content: [{ type: "text", text: "Browser closed." }] };
        }
        return { content: [{ type: "text", text: "Browser was not running." }] };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Desktop MCP Server running on stdio");
  }
}
