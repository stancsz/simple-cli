import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import { chromium, Browser, Page } from "playwright";
import Anthropic from "@anthropic-ai/sdk";

export class AnthropicComputerUseDriver implements DesktopDriver {
  name = "anthropic";
  private browser: Browser | null = null;
  private page: Page | null = null;
  private client: Anthropic | null = null;

  async init() {
    if (this.browser) return;
    const start = Date.now();
    try {
      console.log("Initializing Anthropic Computer Use Driver...");

      this.browser = await chromium.launch({
          headless: process.env.HEADLESS !== 'false'
      });
      this.page = await this.browser.newPage();
      // standard resolution for computer use
      await this.page.setViewportSize({ width: 1024, height: 768 });

      if (process.env.ANTHROPIC_API_KEY) {
          this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      } else {
           // check if we are in a test environment where we might mock the client later?
           // For now, just warn.
          console.warn("[Anthropic] No API key found. Driver will fail if LLM features are used.");
      }

      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'anthropic', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'anthropic', status: 'failure', error: (e as Error).message });
      throw e;
    }
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
      if (!this.page) throw new Error("Browser not initialized");

      // Check for coordinates "x,y"
      const coords = selector.match(/^(\d+),(\d+)$/);
      if (coords) {
          const x = parseInt(coords[1], 10);
          const y = parseInt(coords[2], 10);
          console.log(`[Anthropic] Clicking coordinates: ${x}, ${y}`);
          await this.page.mouse.click(x, y);
          await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'success' });
          return `Clicked coordinates ${x},${y}`;
      }

      // Otherwise, use LLM to find the element
      console.log(`[Anthropic] Clicking element described as: ${selector}`);
      const result = await this.runAnthropicLoop(`Find the element described as "${selector}" and click it. Do not do anything else.`);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'success' });
      return result;

    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async type(selector: string, text: string) {
    const start = Date.now();
    try {
        await this.init();
        if (!this.page) throw new Error("Browser not initialized");

        console.log(`[Anthropic] Typing "${text}" into ${selector}`);
        // We'll rely on the loop to find AND type
        const result = await this.runAnthropicLoop(`Find the element described as "${selector}", click it if necessary, and type "${text}".`);

        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'success' });
        return result;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async screenshot() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Anthropic] Taking screenshot`);
      const buffer = await this.page.screenshot({ fullPage: true });
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'screenshot', status: 'success' });
      return buffer.toString("base64");
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'screenshot', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const text = await this.page.evaluate(() => document.body.innerText);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'extract_text', status: 'success' });
      return text;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'extract_text', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async execute_complex_flow(goal: string) {
    const start = Date.now();
    try {
      console.log(`[Anthropic] Executing complex flow: ${goal}`);
      const result = await this.runAnthropicLoop(goal);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'execute_complex_flow', status: 'success' });
      return result;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'execute_complex_flow', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async shutdown() {
    const start = Date.now();
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'anthropic', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'anthropic', status: 'failure', error: (e as Error).message });
    }
  }

  // --- Private Helper: The Anthropic Agent Loop ---
  private async runAnthropicLoop(goal: string): Promise<string> {
      if (!this.client || !this.page) {
          throw new Error("Anthropic client or page not initialized");
      }

      const messages: any[] = [
          {
              role: "user",
              content: goal
          }
      ];

      // Max turns to prevent infinite loops
      const MAX_TURNS = 10;

      for (let i = 0; i < MAX_TURNS; i++) {
          // 1. Take screenshot for the model to see
          const screenshotBuffer = await this.page.screenshot();
          const screenshotBase64 = screenshotBuffer.toString("base64");

          // Add screenshot to the LAST user message if possible, or append a new user message
          // Actually, we should send the screenshot as part of the current state.
          // In the "computer use" loop pattern, we usually append the screenshot to the *result* of the previous tool use,
          // or if it's the first turn, we include it with the goal.

          if (i === 0) {
              // Append screenshot to the initial goal
              messages[0].content = [
                  { type: "text", text: goal },
                  {
                      type: "image",
                      source: {
                          type: "base64",
                          media_type: "image/png",
                          data: screenshotBase64
                      }
                  }
              ];
          } else {
             // For subsequent turns, we usually just let the model ask for actions.
             // But the model needs to see the result of its action.
             // If the previous turn was a tool use, we should have appended the tool result (which can include a screenshot).
             // Let's rely on the tool execution logic to append screenshots to the tool result.
          }

          // 2. Call Anthropic
          const response = await this.client.beta.messages.create({
              model: "claude-3-5-sonnet-20241022",
              max_tokens: 1024,
              tools: [{
                  type: "computer_20241022",
                  name: "computer",
                  display_width_px: 1024,
                  display_height_px: 768,
                  display_number: 1
              }],
              messages: messages,
              betas: ["computer-use-2024-10-22"]
          });

          // 3. Process Response
          const responseContent = response.content;
          messages.push({ role: "assistant", content: responseContent });

          let toolUsed = false;
          const toolResults: any[] = [];

          for (const block of responseContent) {
              if (block.type === 'tool_use') {
                  toolUsed = true;
                  const toolName = block.name;
                  const toolInput = block.input as any;
                  const toolId = block.id;

                  console.log(`[Anthropic] Tool Use: ${toolName}`, toolInput);

                  let result = "";
                  let isError = false;

                  if (toolName === 'computer') {
                      try {
                          result = await this.executeComputerAction(toolInput.action, toolInput);
                      } catch (err) {
                          result = `Error: ${(err as Error).message}`;
                          isError = true;
                      }
                  }

                  // Take a fresh screenshot to show the result of the action
                  const newScreenshot = await this.page.screenshot();

                  toolResults.push({
                      type: "tool_result",
                      tool_use_id: toolId,
                      content: [
                           { type: "text", text: result },
                           {
                              type: "image",
                              source: {
                                  type: "base64",
                                  media_type: "image/png",
                                  data: newScreenshot.toString("base64")
                              }
                           }
                      ],
                      is_error: isError
                  });
              }
          }

          if (!toolUsed) {
              // If the model didn't use a tool, it might be done or asking a question.
              // We'll return the text response.
              const text = responseContent.find(b => b.type === 'text');
              return (text as any)?.text || "Completed";
          }

          // Append tool results to messages
          messages.push({ role: "user", content: toolResults });
      }

      return "Max turns reached without completion.";
  }

  private async executeComputerAction(action: string, params: any): Promise<string> {
      if (!this.page) throw new Error("Page not initialized");

      switch (action) {
          case "mouse_move":
              if (params.coordinate) {
                  await this.page.mouse.move(params.coordinate[0], params.coordinate[1]);
                  return "moved mouse";
              }
              break;
          case "left_click":
              await this.page.mouse.down();
              await this.page.mouse.up();
              return "left clicked";
          case "type":
              if (params.text) {
                  await this.page.keyboard.type(params.text);
                  return "typed text";
              }
              break;
          case "key":
              if (params.text) {
                  // simplistic key handling
                   await this.page.keyboard.press(params.text);
                   return `pressed key ${params.text}`;
              }
              break;
          case "screenshot":
              // handled automatically by the loop, but we can return success
              return "screenshot taken";
          default:
              return `Action ${action} not implemented`;
      }
      return "Action executed";
  }
}
