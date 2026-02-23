import { z } from "zod";
import { StagehandClient } from "./stagehand_client.js";

const client = new StagehandClient();

export const tools = [
  {
    name: "navigate_to",
    description: "Navigate the browser to a specific URL.",
    parameters: z.object({
      url: z.string().url().describe("The URL to navigate to"),
    }),
    handler: async ({ url }: { url: string }) => {
      try {
        await client.navigate_to(url);
        return { content: [{ type: "text" as const, text: `Navigated to ${url}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "click_element",
    description: "Click an element on the page identified by a CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector of the element to click"),
    }),
    handler: async ({ selector }: { selector: string }) => {
      try {
        await client.click_element(selector);
        return { content: [{ type: "text" as const, text: `Clicked element matching selector: ${selector}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "type_text",
    description: "Type text into an input field identified by a CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector of the input field"),
      text: z.string().describe("The text to type"),
    }),
    handler: async ({ selector, text }: { selector: string; text: string }) => {
      try {
        await client.type_text(selector, text);
        return { content: [{ type: "text" as const, text: `Typed text into ${selector}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot of the current page state.",
    parameters: z.object({}),
    handler: async () => {
      try {
        const base64Image = await client.take_screenshot();
        return {
          content: [
            {
              type: "image" as const,
              data: base64Image,
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "extract_page_text",
    description: "Extract the full text content of the current page.",
    parameters: z.object({}),
    handler: async () => {
      try {
        const text = await client.extract_page_text();
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
];
