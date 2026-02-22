import { z } from "zod";
import { DesktopRouter } from "./router.js";

const router = new DesktopRouter();

const validateSafety = (action: string, humanApprovalRequired?: boolean) => {
    if (humanApprovalRequired) {
        if (process.env.DESKTOP_APPROVE_RISKY !== "true") {
            throw new Error(`[SAFETY] Action '${action}' requires human approval. Set DESKTOP_APPROVE_RISKY=true to proceed.`);
        }
        console.warn(`[SAFETY] High-risk action '${action}' approved via DESKTOP_APPROVE_RISKY env var.`);
    }
};

export const tools = [
  {
    name: "navigate_to",
    description: "Navigate the browser/app to a specific URL or location.",
    parameters: z.object({
      url: z.string().url().describe("The URL to navigate to"),
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
      human_approval_required: z.boolean().optional().describe("Whether this action requires explicit human approval (for high-risk actions)."),
    }),
    handler: async ({ url, task_description, human_approval_required }: { url: string; task_description?: string; human_approval_required?: boolean }) => {
      try {
        validateSafety(`navigate to ${url}`, human_approval_required);
        const driver = await router.selectDriver(task_description || `navigate to ${url}`);
        const result = await driver.navigate(url);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "click_element",
    description: "Click an element on the page identified by a selector.",
    parameters: z.object({
      selector: z.string().describe("Selector of the element to click"),
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
      human_approval_required: z.boolean().optional().describe("Whether this action requires explicit human approval."),
    }),
    handler: async ({ selector, task_description, human_approval_required }: { selector: string; task_description?: string; human_approval_required?: boolean }) => {
      try {
        validateSafety(`click ${selector}`, human_approval_required);
        const driver = await router.selectDriver(task_description || `click ${selector}`);
        const result = await driver.click(selector);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "type_text",
    description: "Type text into an input field identified by a selector.",
    parameters: z.object({
      selector: z.string().describe("Selector of the input field"),
      text: z.string().describe("The text to type"),
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
      human_approval_required: z.boolean().optional().describe("Whether this action requires explicit human approval."),
    }),
    handler: async ({ selector, text, task_description, human_approval_required }: { selector: string; text: string; task_description?: string; human_approval_required?: boolean }) => {
      try {
        validateSafety(`type into ${selector}`, human_approval_required);
        const driver = await router.selectDriver(task_description || `type into ${selector}`);
        const result = await driver.type(selector, text);
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
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
    }),
    handler: async ({ task_description }: { task_description?: string }) => {
      try {
        const driver = await router.selectDriver(task_description || "screenshot");
        const base64Image = await driver.screenshot();
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
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
    }),
    handler: async ({ task_description }: { task_description?: string }) => {
      try {
        const driver = await router.selectDriver(task_description || "extract text");
        const text = await driver.extract_text();
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "execute_complex_flow",
    description: "Execute a complex, multi-step flow or action described in natural language.",
    parameters: z.object({
      goal: z.string().describe("The goal or instruction to execute (e.g., 'Fill out the contact form with...')."),
      task_description: z.string().optional().describe("Additional context for routing (optional, defaults to goal)."),
      human_approval_required: z.boolean().optional().describe("Whether this action requires explicit human approval."),
    }),
    handler: async ({ goal, task_description, human_approval_required }: { goal: string; task_description?: string; human_approval_required?: boolean }) => {
      try {
        validateSafety(`execute flow: ${goal}`, human_approval_required);
        const driver = await router.selectDriver(task_description || goal);
        const result = await driver.execute_complex_flow(goal);
        return { content: [{ type: "text", text: result }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
];
