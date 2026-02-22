import { z } from "zod";
import { DesktopBackend } from "./interfaces/DesktopBackend.js";
import { EpisodicMemory } from "../../brain/episodic.js";

async function logInteraction(
  memory: EpisodicMemory | undefined,
  taskId: string | undefined,
  request: string,
  solution: string,
  company: string | undefined
) {
  if (memory && taskId) {
    try {
      // Store interaction as an episode
      await memory.store(taskId, request, solution, [], company);
    } catch (e) {
      console.warn("Failed to log interaction to Brain:", e);
    }
  }
}

export const createTools = (backend: DesktopBackend, memory?: EpisodicMemory) => [
  {
    name: "navigate_to",
    description: "Navigate the browser to a specific URL.",
    parameters: z.object({
      url: z.string().url().describe("The URL to navigate to"),
      taskId: z.string().optional().describe("Task ID for logging context"),
      company: z.string().optional().describe("Company ID for multi-tenancy logging")
    }),
    handler: async ({ url, taskId, company }: { url: string, taskId?: string, company?: string }) => {
      try {
        const result = await backend.navigate_to(url);
        await logInteraction(memory, taskId, `navigate_to: ${url}`, result, company);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "click_element",
    description: "Click an element on the page identified by a CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector of the element to click"),
      taskId: z.string().optional().describe("Task ID for logging context"),
      company: z.string().optional().describe("Company ID for multi-tenancy logging")
    }),
    handler: async ({ selector, taskId, company }: { selector: string, taskId?: string, company?: string }) => {
      try {
        const result = await backend.click_element(selector);
        await logInteraction(memory, taskId, `click_element: ${selector}`, result, company);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "type_text",
    description: "Type text into an input field identified by a CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector of the input field"),
      text: z.string().describe("The text to type"),
      taskId: z.string().optional().describe("Task ID for logging context"),
      company: z.string().optional().describe("Company ID for multi-tenancy logging")
    }),
    handler: async ({ selector, text, taskId, company }: { selector: string; text: string, taskId?: string, company?: string }) => {
      try {
        const result = await backend.type_text(selector, text);
        await logInteraction(memory, taskId, `type_text: ${text} into ${selector}`, result, company);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "take_screenshot",
    description: "Take a screenshot of the current page state.",
    parameters: z.object({
      taskId: z.string().optional().describe("Task ID for logging context"),
      company: z.string().optional().describe("Company ID for multi-tenancy logging")
    }),
    handler: async ({ taskId, company }: { taskId?: string, company?: string }) => {
      try {
        const base64Image = await backend.take_screenshot();
        await logInteraction(memory, taskId, `take_screenshot`, "Screenshot taken", company);
        return {
          content: [
            {
              type: "image",
              data: base64Image,
              mimeType: "image/png",
            },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "extract_page_text",
    description: "Extract the full text content of the current page.",
    parameters: z.object({
      taskId: z.string().optional().describe("Task ID for logging context"),
      company: z.string().optional().describe("Company ID for multi-tenancy logging")
    }),
    handler: async ({ taskId, company }: { taskId?: string, company?: string }) => {
      try {
        const text = await backend.extract_page_text();
        await logInteraction(memory, taskId, `extract_page_text`, `Extracted text (length: ${text.length})`, company);
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
];
