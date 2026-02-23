import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import { generateText, tool, CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OpenAIOperatorDriver implements DesktopDriver {
  name = "openai";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: any = {};
  private openai: any;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const configPath = path.resolve(__dirname, "../config.json");
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const json = JSON.parse(fileContent);
        this.config = json.desktop_orchestrator?.drivers?.openai || {};
      }
    } catch (e) {
      console.warn("Failed to load config.json for OpenAIOperatorDriver:", e);
    }
  }

  async init() {
    if (this.browser) return;

    const start = Date.now();
    try {
      console.log("Initializing OpenAI Operator Driver...");

      const apiKey = this.config.api_key || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OpenAI API key not found in config or environment variables.");
      }
      this.openai = createOpenAI({ apiKey });

      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'openai', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'openai', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async navigate(url: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[OpenAI] Navigating to ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'navigate', status: 'success' });
      return `[OpenAI] Navigated to ${url}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'navigate', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async click(selector: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);

      if (isCss) {
        console.log(`[OpenAI] Clicking CSS selector: ${selector}`);
        await this.page.click(selector);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'click', status: 'success' });
        return `[OpenAI] Clicked ${selector}`;
      } else {
        console.log(`[OpenAI] Clicking visual element: ${selector}`);
        const result = await this.execute_complex_flow(`Click the element described as: ${selector}`);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'click', status: 'success' });
        return result;
      }
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'click', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async type(selector: string, text: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);

      if (isCss) {
        console.log(`[OpenAI] Typing into CSS selector: ${selector}`);
        await this.page.fill(selector, text);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'type', status: 'success' });
        return `[OpenAI] Typed into ${selector}`;
      } else {
         console.log(`[OpenAI] Typing into visual element: ${selector}`);
         const result = await this.execute_complex_flow(`Type "${text}" into the element described as: ${selector}`);
         await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'type', status: 'success' });
         return result;
      }
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'type', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async screenshot() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const buffer = await this.page.screenshot({ fullPage: true });
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'screenshot', status: 'success' });
      return buffer.toString("base64");
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'screenshot', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const text = await this.page.evaluate(() => document.body.innerText);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'extract_text', status: 'success' });
      return text;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'extract_text', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async execute_complex_flow(goal: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page || !this.openai) throw new Error("Driver not initialized");

      console.log(`[OpenAI] Executing complex flow: ${goal}`);
      const result = await this.runOpenAILoop(goal);

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'execute_complex_flow', status: 'success' });
      return result;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'execute_complex_flow', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async shutdown() {
    const start = Date.now();
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
      }
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'openai', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'openai', status: 'failure', error: (e as Error).message });
    }
  }

  private async runOpenAILoop(goal: string): Promise<string> {
    const maxSteps = 10;
    const messages: CoreMessage[] = [];

    // Initial State
    const screenshotBuffer = await this.page!.screenshot({ type: 'png' });
    const screenshotBase64 = screenshotBuffer.toString('base64');

    messages.push({
        role: "user",
        content: [
            { type: "text", text: `Goal: ${goal}. You are an operator controlling a browser. Use the provided tools to achieve the goal. The current screen is attached.` },
            { type: "image", image: screenshotBase64 }
        ]
    });

    for (let i = 0; i < maxSteps; i++) {
        const result = await generateText({
            model: this.openai(this.config.model || "gpt-4o"),
            messages: messages,
            tools: {
                click_element: tool({
                    description: 'Click an element on the page',
                    parameters: z.object({
                        selector: z.string().describe('CSS selector of the element to click. If unknown, try to describe it or guess likely selectors.'),
                    }),
                    execute: async ({ selector }) => {
                        try {
                            // Try CSS click first if it looks like CSS
                             const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);
                             if (isCss) {
                                await this.page!.click(selector);
                             } else {
                                // If not CSS, maybe try text locator
                                await this.page!.getByText(selector).click().catch(() => {
                                    throw new Error(`Could not find element with text or selector: ${selector}`);
                                });
                             }
                            return `Clicked ${selector}`;
                        } catch (e) {
                            return `Failed to click ${selector}: ${(e as Error).message}`;
                        }
                    },
                }),
                type_text: tool({
                    description: 'Type text into an input field',
                    parameters: z.object({
                        selector: z.string().describe('CSS selector of the input'),
                        text: z.string().describe('Text to type'),
                    }),
                    execute: async ({ selector, text }) => {
                        try {
                            await this.page!.fill(selector, text);
                            return `Typed "${text}" into ${selector}`;
                        } catch (e) {
                            return `Failed to type into ${selector}: ${(e as Error).message}`;
                        }
                    },
                }),
                scroll: tool({
                    description: 'Scroll the page',
                    parameters: z.object({
                        direction: z.enum(['up', 'down']).describe('Direction to scroll'),
                        amount: z.number().optional().describe('Amount in pixels'),
                    }),
                    execute: async ({ direction, amount }) => {
                        const y = direction === 'down' ? (amount || 500) : -(amount || 500);
                        await this.page!.mouse.wheel(0, y);
                        return `Scrolled ${direction}`;
                    },
                }),
                extract_content: tool({
                    description: 'Extract text content from the page',
                    parameters: z.object({}),
                    execute: async () => {
                         return await this.page!.evaluate(() => document.body.innerText);
                    }
                }),
                done: tool({
                    description: 'Signal that the task is complete',
                    parameters: z.object({
                        result: z.string().describe('The result or answer found'),
                    }),
                    execute: async ({ result }) => {
                        return `DONE: ${result}`;
                    },
                }),
            },
        });

        // Add assistant response to history
        messages.push({ role: "assistant", content: result.response.messages[0].content });

        // If tool calls occurred, the `generateText` automatically executes them?
        // Wait, `generateText` with `tools` executes the tools and returns the result in `toolResults`?
        // No, `generateText` executes tools if they are provided, but it returns the *final* text if it did not recursively call itself (maxSteps=1).
        // But `ai` SDK documentation says `generateText` executes tools.
        // Wait, if I don't set `maxSteps` > 1, it stops after generating tool calls (but executes them? No, it returns tool calls).
        // Actually, `generateText` executes tools if `maxSteps` > 1 is NOT set? No.
        // If `maxSteps` is not set (default 1), it generates tool calls but doesn't execute them automatically?
        // Wait, `generateText` returns `toolCalls` and `toolResults`.
        // If `tools` are provided with `execute` functions, `generateText` executes them.

        // I want step-by-step control to inject screenshots.
        // So I should verify what `result` contains.
        // `result.toolCalls` contains the calls.
        // `result.toolResults` contains the results of execution.

        // I need to add tool calls and tool results to `messages` manually if I want to continue the loop.
        // `result.response.messages` contains the assistant message (with tool calls).
        // But does it contain the tool results?
        // If `generateText` executed the tools, `toolResults` are available.
        // I need to add them to `messages` as `tool-result`.

        if (result.toolResults && result.toolResults.length > 0) {
             const toolResultsMessage: CoreMessage = {
                 role: 'tool',
                 content: result.toolResults.map(tr => ({
                     type: 'tool-result',
                     toolCallId: tr.toolCallId,
                     result: tr.result,
                 })) as any
             };
             messages.push(toolResultsMessage);

             // Check if "done" tool was called
             const doneResult = result.toolResults.find(tr => tr.toolName === 'done');
             if (doneResult) {
                 return doneResult.result as string;
             }

             // Take new screenshot for next turn
             const newScreenshotBuffer = await this.page!.screenshot({ type: 'png' });
             const newScreenshotBase64 = newScreenshotBuffer.toString('base64');

             messages.push({
                 role: "user",
                 content: [
                     { type: "image", image: newScreenshotBase64 },
                     { type: "text", text: "Task update: see new screenshot. Continue." }
                 ]
             });
        } else {
            // No tools called. Maybe text response.
            return result.text;
        }
    }

    return "Max steps reached.";
  }
}
