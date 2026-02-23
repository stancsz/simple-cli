import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import Anthropic from "@anthropic-ai/sdk";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AnthropicComputerUseDriver implements DesktopDriver {
  name = "anthropic";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: any = {};
  private client: Anthropic | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const configPath = path.resolve(__dirname, "../config.json");
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const json = JSON.parse(fileContent);
        this.config = json.desktop_orchestrator?.drivers?.anthropic || {};
      }
    } catch (e) {
      console.warn("Failed to load config.json for AnthropicComputerUseDriver:", e);
    }
  }

  async init() {
    if (this.browser) return;

    const start = Date.now();
    try {
      console.log("Initializing Anthropic Computer Use Driver...");

      const apiKey = this.config.api_key || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("Anthropic API key not found in config or environment variables.");
      }
      this.client = new Anthropic({ apiKey });

      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false", // Default to headless unless specified
      });

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

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

      // Heuristic: Is it a CSS selector?
      const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);

      if (isCss) {
        console.log(`[Anthropic] Clicking CSS selector: ${selector}`);
        await this.page.click(selector);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'success' });
        return `[Anthropic] Clicked ${selector}`;
      } else {
        // Use Anthropic Computer Use for natural language selector
        console.log(`[Anthropic] Clicking visual element: ${selector}`);
        const result = await this.execute_complex_flow(`Click the element described as: ${selector}`);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'click', status: 'success' });
        return result;
      }
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

      // Heuristic: Is it a CSS selector?
      const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);

      if (isCss) {
        console.log(`[Anthropic] Typing into CSS selector: ${selector}`);
        await this.page.fill(selector, text);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'success' });
        return `[Anthropic] Typed into ${selector}`;
      } else {
         console.log(`[Anthropic] Typing into visual element: ${selector}`);
         const result = await this.execute_complex_flow(`Type "${text}" into the element described as: ${selector}`);
         await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'anthropic', action: 'type', status: 'success' });
         return result;
      }
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
      await this.init();
      if (!this.page || !this.client) throw new Error("Driver not initialized");

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
        this.context = null;
        this.page = null;
      }
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'anthropic', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'anthropic', status: 'failure', error: (e as Error).message });
    }
  }

  private async runAnthropicLoop(goal: string): Promise<string> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
            role: "user",
            content: goal
        }
    ];

    const maxSteps = 10;

    for (let i = 0; i < maxSteps; i++) {
        // Take screenshot for context
        const screenshotBuffer = await this.page!.screenshot({ type: 'png' });
        const screenshotBase64 = screenshotBuffer.toString('base64');

        // Add screenshot to the last user message or as a new message?
        // Actually, Computer Use works best when we provide the image with the user request or tool result.
        // For simplicity in this loop, if it's the first step, we append image to user message.
        // If it's a subsequent step, we append image to the tool result.
        // However, Anthropic API expects image block.

        // Let's restructure: We send the conversation history.
        // We need to inject the screenshot into the conversation.
        // If it's the start, we modify the initial message.
        if (i === 0) {
             messages[0].content = [
                { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
                { type: "text", text: goal }
             ];
        }

        const response = await this.client!.beta.messages.create({
            model: this.config.model || "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            tools: [{
              type: "computer_20241022",
              name: "computer",
              display_width_px: this.config.display_width || 1024,
              display_height_px: this.config.display_height || 768,
              display_number: 1,
            }, {
              type: "bash_20241022",
              name: "bash"
            }, {
              type: "text_editor_20241022",
              name: "str_replace_editor"
            }],
            betas: ["computer-use-2024-10-22"],
            messages: messages,
        });

        const assistantMessage = response.content;
        messages.push({ role: "assistant", content: assistantMessage });

        // Process tool calls
        let toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        let hasToolUse = false;

        for (const block of assistantMessage) {
            if (block.type === 'tool_use') {
                hasToolUse = true;
                const result = await this.executeTool(block);
                toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                });
            }
        }

        if (!hasToolUse) {
            // No tool use, maybe done?
            // Return the text content as result
            const text = assistantMessage.filter(b => b.type === 'text').map(b => (b as any).text).join("\n");
            return text || "Completed (no output)";
        }

        // Add tool results to history
        // If we executed an action that changes the screen, we should include a new screenshot in the result!
        // The Computer Use API recommends including a screenshot in the tool result for computer actions.
        const newScreenshotBuffer = await this.page!.screenshot({ type: 'png' });
        const newScreenshotBase64 = newScreenshotBuffer.toString('base64');

        // Append screenshot to the last tool result (or all of them? usually just one is enough context)
        if (toolResults.length > 0) {
            const lastResult = toolResults[toolResults.length - 1];
            if (Array.isArray(lastResult.content)) {
                lastResult.content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: newScreenshotBase64 } });
            } else {
                 lastResult.content = [
                    { type: "text", text: lastResult.content as string },
                    { type: "image", source: { type: "base64", media_type: "image/png", data: newScreenshotBase64 } }
                 ];
            }
        }

        messages.push({ role: "user", content: toolResults });
    }

    return "Max steps reached without explicit completion.";
  }

  private async executeTool(toolUse: Anthropic.Beta.BetaToolUseBlock): Promise<string> {
      if (toolUse.name === 'computer') {
          const action = toolUse.input as any;
          // action: { action: "screenshot" | "click" | ..., coordinate?: [x, y], text?: string }

          if (action.action === 'screenshot') {
              return "Screenshot taken (implicit in loop)";
          } else if (action.action === 'left_click') {
              if (action.coordinate) {
                  await this.page!.mouse.click(action.coordinate[0], action.coordinate[1]);
                  return "Clicked";
              }
          } else if (action.action === 'type') {
              if (action.text) {
                  await this.page!.keyboard.type(action.text);
                  return "Typed";
              }
          } else if (action.action === 'key') {
              if (action.text) {
                  await this.page!.keyboard.press(action.text);
                  return "Key pressed";
              }
          } else if (action.action === 'mouse_move') {
              if (action.coordinate) {
                  await this.page!.mouse.move(action.coordinate[0], action.coordinate[1]);
                  return "Moved mouse";
              }
          }
          // Handle other actions (drag, right_click, etc.) as needed
          return "Action executed";
      } else if (toolUse.name === 'bash') {
          return "Bash tool not supported in this driver context yet.";
      } else if (toolUse.name === 'str_replace_editor') {
          return "Editor tool not supported in this driver context yet.";
      }
      return "Unknown tool";
  }
}
