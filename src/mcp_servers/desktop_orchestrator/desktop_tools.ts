import { z } from "zod";
import { DesktopRouter } from "./router.js";
import { DriverValidator } from "./validation.js";
import { DesktopIntegration, VerificationRequest } from "./integration.js";
import { QualityGate } from "./quality_gate.js";

const router = new DesktopRouter();
const validator = new DriverValidator();
const integration = new DesktopIntegration();
const qualityGate = new QualityGate();

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
        return { content: [{ type: "text" as const, text: result }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
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
        return { content: [{ type: "text" as const, text: result }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
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
        return { content: [{ type: "text" as const, text: result }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
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
    parameters: z.object({
      task_description: z.string().optional().describe("Description of the overall task (for routing)"),
    }),
    handler: async ({ task_description }: { task_description?: string }) => {
      try {
        const driver = await router.selectDriver(task_description || "extract text");
        const text = await driver.extract_text();
        return { content: [{ type: "text" as const, text }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
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
        return { content: [{ type: "text" as const, text: result }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "validate_desktop_driver",
    description: "Run a validation suite on a specific desktop driver.",
    parameters: z.object({
      driver_name: z.string().describe("The name of the driver to validate (e.g., 'stagehand', 'skyvern')."),
    }),
    handler: async ({ driver_name }: { driver_name: string }) => {
      try {
        const driver = router.getDriver(driver_name);
        if (!driver) {
          throw new Error(`Driver '${driver_name}' not found.`);
        }
        const result = await validator.validate(driver, { skipShutdown: true });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "validate_all_desktop_drivers",
    description: "Run validation suite on all available desktop drivers.",
    parameters: z.object({}),
    handler: async () => {
      try {
        const driverNames = router.getAvailableDrivers();
        const results = [];
        for (const name of driverNames) {
          const driver = router.getDriver(name);
          if (driver) {
            results.push(await validator.validate(driver, { skipShutdown: true }));
          }
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "verify_desktop_action",
    description: "Verify that a desktop action had the intended effect.",
    parameters: z.object({
      type: z.enum(['url_contains', 'text_present', 'element_visible']).describe("The type of verification to perform."),
      value: z.string().describe("The value to verify (URL part, text content, or selector)."),
      task_description: z.string().optional().describe("Description of the task to help route to the correct driver (should match previous action)."),
    }),
    handler: async ({ type, value, task_description }: { type: 'url_contains' | 'text_present' | 'element_visible'; value: string; task_description?: string }) => {
      try {
        const driver = await router.selectDriver(task_description || "verification");
        const result = await integration.verify_action({ type, value, driver });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
  {
    name: "assess_page_quality",
    description: "Assess the visual quality of the current page using AI critique.",
    parameters: z.object({
      task_description: z.string().optional().describe("Description of the page purpose to contextually assess quality."),
    }),
    handler: async ({ task_description }: { task_description?: string }) => {
      try {
        const driver = await router.selectDriver(task_description || "screenshot for quality assessment");
        const screenshot = await driver.screenshot();
        const html = await driver.extract_text(); // Passing text content as context proxy or grab HTML if possible. Driver only has extract_text.
        // Ideally we want HTML for tech checks, but extract_text gives body text.
        // Let's assume we pass text as context if HTML not available, or just screenshot.

        const result = await qualityGate.assess(screenshot, task_description, html);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    },
  },
];
