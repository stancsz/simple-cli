import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import OpenAI from "openai";
import { chromium, Browser, Page, BrowserContext } from "playwright";

export class OpenAIOperatorDriver implements DesktopDriver {
  name = "openai";
  private openai: OpenAI;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async init() {
    const start = Date.now();
    try {
      console.log("Initializing OpenAI Operator Driver...");
      if (!process.env.OPENAI_API_KEY) {
          throw new Error("OPENAI_API_KEY is missing");
      }
      if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
          this.context = await this.browser.newContext();
          this.page = await this.context.newPage();
      }
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
      console.log(`[OpenAI] Clicking ${selector}`);
      // Try direct click, if fails use LLM to find selector?
      // For now, assume selector is valid CSS or text
      try {
          await this.page.click(selector, { timeout: 2000 });
      } catch (e) {
          // Fallback: use LLM to find element by text
          // This would be part of "Operator" logic, but simplified here
          console.log(`[OpenAI] CSS click failed, trying text match for ${selector}`);
          const element = await this.page.getByText(selector).first();
          await element.click();
      }
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'click', status: 'success' });
      return `[OpenAI] Clicked ${selector}`;
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
      console.log(`[OpenAI] Typing "${text}" into ${selector}`);
      await this.page.fill(selector, text);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'type', status: 'success' });
      return `[OpenAI] Typed text`;
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
      const buffer = await this.page.screenshot();
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
      console.log(`[OpenAI] Executing complex flow: ${goal}`);
      await this.init();

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: "You are an autonomous research agent. Use the browser tools to accomplish the user's goal." },
          { role: "user", content: goal }
      ];

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
          {
              type: "function",
              function: {
                  name: "navigate",
                  description: "Navigate to a URL",
                  parameters: {
                      type: "object",
                      properties: { url: { type: "string" } },
                      required: ["url"]
                  }
              }
          },
          {
              type: "function",
              function: {
                  name: "click",
                  description: "Click an element by selector or text",
                  parameters: {
                      type: "object",
                      properties: { selector: { type: "string" } },
                      required: ["selector"]
                  }
              }
          },
          {
              type: "function",
              function: {
                  name: "type",
                  description: "Type text into an element",
                  parameters: {
                      type: "object",
                      properties: { selector: { type: "string" }, text: { type: "string" } },
                      required: ["selector", "text"]
                  }
              }
          },
          {
              type: "function",
              function: {
                  name: "extract_text",
                  description: "Get the text content of the current page",
                  parameters: { type: "object", properties: {}, required: [] }
              }
          }
      ];

      let loops = 0;
      const MAX_LOOPS = 10;
      let finalResult = "";

      while (loops < MAX_LOOPS) {
          loops++;
          const response = await this.openai.chat.completions.create({
              model: "gpt-4o",
              messages,
              tools,
              tool_choice: "auto"
          });

          const msg = response.choices[0].message;
          messages.push(msg);

          if (msg.tool_calls && msg.tool_calls.length > 0) {
              for (const toolCall of msg.tool_calls) {
                  const fnName = toolCall.function.name;
                  const args = JSON.parse(toolCall.function.arguments);
                  let result = "";

                  try {
                      console.log(`[OpenAI] Tool Call: ${fnName}`, args);
                      if (fnName === "navigate") result = await this.navigate(args.url);
                      else if (fnName === "click") result = await this.click(args.selector);
                      else if (fnName === "type") result = await this.type(args.selector, args.text);
                      else if (fnName === "extract_text") result = await this.extract_text();
                      else result = "Unknown tool";
                  } catch (e) {
                      result = `Error: ${(e as Error).message}`;
                  }

                  messages.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: result
                  });
              }
          } else {
              finalResult = msg.content || "Done";
              break;
          }
      }

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'openai', action: 'execute_complex_flow', status: 'success' });
      return `[OpenAI] Result: ${finalResult}`;
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
      console.log("[OpenAI] Shutting down");
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'openai', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'openai', status: 'failure', error: (e as Error).message });
    }
  }
}
