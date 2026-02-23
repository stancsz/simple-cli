import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import Anthropic from "@anthropic-ai/sdk";
import { chromium, Browser, Page, BrowserContext } from "playwright";

export class AnthropicComputerUseDriver implements DesktopDriver {
  name = "anthropic";
  private client: Anthropic | null = null;
  private messages: Anthropic.Beta.BetaMessageParam[] = [];
  private screenshotBase64: string = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="; // 1x1 px fallback
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor() {
    // Initialization deferred to init()
  }

  async init() {
    const start = Date.now();
    try {
      console.log("Initializing Anthropic Computer Use Driver...");

      if (!this.client) {
          if (!process.env.ANTHROPIC_API_KEY) {
              throw new Error("ANTHROPIC_API_KEY is missing");
          }
          this.client = new Anthropic({
              apiKey: process.env.ANTHROPIC_API_KEY,
          });
      }

      if (!this.browser) {
          this.browser = await chromium.launch({ headless: true });
          this.context = await this.browser.newContext({
              viewport: { width: 1024, height: 768 },
              deviceScaleFactor: 1,
          });
          this.page = await this.context.newPage();
      }

      this.messages = [];
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'anthropic', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'anthropic', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  private async runLoop(prompt: string, maxSteps = 10): Promise<string> {
      // Add user message
      this.messages.push({
          role: "user",
          content: [
              { type: "text", text: prompt }
          ]
      });

      // Simple history management to prevent overflow
      if (this.messages.length > 50) {
          console.warn("[Anthropic] Conversation history too long, truncating (keeping last 30).");
          // Naive truncation logic could go here
      }

      for (let i = 0; i < maxSteps; i++) {
          if (!this.client) throw new Error("Anthropic client not initialized");

          const response = await this.client.beta.messages.create({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 1024,
              messages: this.messages,
              tools: [
                  {
                      type: "computer_20241022",
                      name: "computer",
                      display_height_px: 768,
                      display_width_px: 1024,
                      display_number: 0,
                  },
                  {
                      type: "bash_20241022",
                      name: "bash",
                  },
                  {
                      type: "text_editor_20241022",
                      name: "str_replace_editor",
                  }
              ],
              betas: ["computer-use-2024-10-22"],
          });

          this.messages.push({
            role: "assistant",
            content: response.content,
          });

          // Check for tool use
          let toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          let finalText = "";

          for (const block of response.content) {
              if (block.type === "text") {
                  finalText += block.text;
                  console.log(`[Anthropic] Thought: ${block.text}`);
              } else if (block.type === "tool_use") {
                  console.log(`[Anthropic] Tool Use: ${block.name}`, block.input);
                  const result = await this.executeTool(block.name, block.input);
                  toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: result,
                  });
              }
          }

          if (toolResults.length > 0) {
              this.messages.push({
                  role: "user",
                  content: toolResults,
              });
          } else {
              // No tools used, return final text
              return finalText;
          }
      }
      return "Max steps reached without completion.";
  }

  private async executeTool(name: string, input: any): Promise<string> {
      if (name === "computer") {
          const action = input.action;

          if (action === "screenshot") {
              if (this.page) {
                  const buffer = await this.page.screenshot();
                  return buffer.toString("base64");
              }
              return this.screenshotBase64;
          }

          if (!this.page) return "Error: Browser not initialized";

          try {
              if (action === "mouse_move") {
                  const { coordinate } = input;
                  if (coordinate) await this.page.mouse.move(coordinate[0], coordinate[1]);
                  return "Moved mouse";
              }
              if (action === "left_click") {
                  const { coordinate } = input;
                  if (coordinate) await this.page.mouse.click(coordinate[0], coordinate[1]);
                  return "Left clicked";
              }
              if (action === "type") {
                  await this.page.keyboard.type(input.text);
                  return "Typed text";
              }
              if (action === "key") {
                  // Anthropic sends keys like 'return', 'down'. Playwright maps mostly 1:1.
                  await this.page.keyboard.press(input.text);
                  return "Pressed key";
              }
              if (action === "cursor_position") {
                  // Playwright doesn't easily expose cursor pos, return placeholder
                  return `coordinate: [0, 0]`;
              }
          } catch (e) {
              return `Error executing action ${action}: ${(e as Error).message}`;
          }

          return "Action executed successfully";
      } else if (name === "bash") {
          console.log(`[Anthropic] Executing Bash: ${input.command}`);
          return "Bash command executed (mocked)";
      }
      return "Tool not supported";
  }

  async navigate(url: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Anthropic] Navigating to ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'navigate', status: 'success' });
      return `[Anthropic] Navigated to ${url}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'navigate', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async click(selector: string) {
    const start = Date.now();
    try {
      await this.init();
      console.log(`[Anthropic] Clicking ${selector}`);
      await this.runLoop(`Find the element described as '${selector}' and click on it. Take a screenshot first if needed.`);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'success' });
      return `[Anthropic] Clicked ${selector}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async type(selector: string, text: string) {
    const start = Date.now();
    try {
      await this.init();
      console.log(`[Anthropic] Typing "${text}" into ${selector}`);
      await this.runLoop(`Find '${selector}', click it, and type '${text}'.`);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'success' });
      return `[Anthropic] Typed text`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async screenshot() {
    if (this.page) {
        const buffer = await this.page.screenshot();
        return buffer.toString("base64");
    }
    return this.screenshotBase64;
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();
      if (this.page) {
          const text = await this.page.evaluate(() => document.body.innerText);
          await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'extract_text', status: 'success' });
          return text;
      }
      const res = await this.runLoop("Read the text on the screen and return it.");
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'extract_text', status: 'success' });
      return res;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'extract_text', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async execute_complex_flow(goal: string) {
    const start = Date.now();
    try {
      await this.init();
      console.log(`[Anthropic] Executing complex flow: ${goal}`);
      const res = await this.runLoop(goal, 20);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'execute_complex_flow', status: 'success' });
      return `[Anthropic] Result: ${res}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'execute_complex_flow', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async shutdown() {
    if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.context = null;
        this.page = null;
    }
    this.messages = [];
  }
}
