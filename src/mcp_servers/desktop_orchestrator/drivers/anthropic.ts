import { DesktopDriver } from "../types.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { Anthropic } from "@anthropic-ai/sdk";
import { Page } from "playwright";

export class AnthropicComputerUseDriver implements DesktopDriver {
  name = "anthropic";
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;
  private client: Anthropic;
  private messages: Anthropic.Beta.BetaMessageParam[] = [];

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async init() {
    if (!this.stagehand) {
      console.log("[Anthropic] Initializing Stagehand for browser control...");
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        debugDom: true,
      });
      await this.stagehand.init();
      this.page = this.stagehand.page;
      console.log("[Anthropic] Browser initialized.");
    }
  }

  async navigate(url: string): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`[Anthropic] Navigating to ${url}...`);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return `Navigated to ${url}`;
  }

  async click(selector: string): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`[Anthropic] processing semantic click: ${selector}`);

    // We treat 'selector' as a description for the LLM if it's not a trivial CSS selector,
    // or simply use LLM to be robust. Given this is the "Anthropic" driver,
    // we assume the user wants visual intelligence.
    return this.executeAction(`Find the element described as '${selector}' and click it.`);
  }

  async type(selector: string, text: string): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`[Anthropic] processing semantic type: "${text}" into ${selector}`);

    return this.executeAction(`Find the element described as '${selector}' and type '${text}' into it.`);
  }

  async screenshot(): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString("base64");
  }

  async extract_text(): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    const text = await this.page.evaluate(() => document.body.innerText);
    return text;
  }

  async execute_complex_flow(goal: string): Promise<string> {
    await this.init();
    return this.executeAction(goal);
  }

  async shutdown() {
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = null;
      this.page = null;
    }
  }

  private async executeAction(instruction: string): Promise<string> {
    if (!this.page) throw new Error("Browser not initialized");

    // Add user instruction to history
    this.messages.push({
      role: "user",
      content: instruction,
    });

    // Run the loop
    let steps = 0;
    const maxSteps = 10; // Limit steps to prevent infinite loops

    while (steps < maxSteps) {
      steps++;

      // Take screenshot for context if needed (Anthropic usually needs a screenshot to "see")
      // We append the screenshot to the LAST user message if it's the start,
      // or as a result of a tool use?
      // Actually, standard practice: send screenshot with the request.
      // But we need to be careful not to duplicate screenshots.
      // If the last message was from User, append screenshot.
      // If the last message was Tool Result, append screenshot there?
      // Actually, Computer Use API expects screenshot in tool_result for 'screenshot' action,
      // OR in user message.

      // For simplicity, we can let the model ask for a screenshot (using computer tool 'screenshot'),
      // OR we force provide one. The prompt says "Map semantic actions... to Computer Use".
      // Usually, to click something, you need to see it.
      // So we should probably provide a screenshot initially or ensure the model has one.

      // Let's rely on the model. If it hasn't seen the screen, it should take a screenshot.
      // BUT, to speed it up, we can inject a screenshot in the latest user message
      // if it's the first turn or if requested.
      // Let's inject a screenshot into the current turn if it's a new "User" input.

      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
        // Convert string content to array with image
        const screenshot = await this.page.screenshot({ type: 'png' }); // png required
        const base64Image = screenshot.toString('base64');

        lastMsg.content = [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64Image,
            },
          },
          {
            type: "text",
            text: lastMsg.content,
          }
        ];
      }

      try {
          const response = await this.client.beta.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 1024,
            tools: [
              {
                type: "computer_20241022",
                name: "computer",
                display_width_px: 1280,
                display_height_px: 800,
                display_number: 0,
              },
            ],
            messages: this.messages,
            headers: {
              "anthropic-beta": "computer-use-2024-10-22",
            },
          });

          // Add assistant response to history
          this.messages.push({
              role: "assistant",
              content: response.content,
          });

          // Process tool calls
          let toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          let finalAnswer = "";

          for (const block of response.content) {
            if (block.type === 'text') {
                console.log(`[Anthropic] Thought: ${block.text}`);
                finalAnswer += block.text;
            } else if (block.type === 'tool_use') {
                const result = await this.handleToolUse(block);
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
              // No tool calls, assume task is done
              return finalAnswer || "Task completed (no more actions).";
          }

      } catch (e) {
          console.error("Anthropic API Error:", e);
          return `Error: ${(e as Error).message}`;
      }
    }

    return "Max steps reached.";
  }

  private async handleToolUse(toolUse: Anthropic.Beta.BetaToolUseBlock): Promise<string | Array<any>> {
      if (toolUse.name !== 'computer') {
          return "Unknown tool";
      }

      const input = toolUse.input as any;
      const action = input.action;

      console.log(`[Anthropic] Executing action: ${action}`, input);

      if (!this.page) return "Browser not initialized";

      try {
          switch (action) {
              case 'screenshot':
                  const buffer = await this.page.screenshot({ type: 'png' });
                  return [
                      {
                          type: "image",
                          source: {
                              type: "base64",
                              media_type: "image/png",
                              data: buffer.toString('base64'),
                          },
                      }
                  ];

              case 'left_click':
              case 'right_click':
              case 'middle_click':
              case 'double_click':
              case 'mouse_move':
              case 'left_click_drag':
                  if (input.coordinate) {
                      const [x, y] = input.coordinate;
                      if (action === 'mouse_move') {
                          await this.page.mouse.move(x, y);
                      } else if (action === 'left_click_drag') {
                          await this.page.mouse.move(x, y);
                          await this.page.mouse.down();
                      } else {
                          // clicks
                          const button = action === 'right_click' ? 'right' :
                                         action === 'middle_click' ? 'middle' : 'left';

                          if (action === 'double_click') {
                              await this.page.mouse.dblclick(x, y);
                          } else {
                              await this.page.mouse.click(x, y, { button });
                          }
                      }
                      // Return screenshot after action to allow visual verification
                      return await this.takeScreenshotResult("Action executed");
                  }
                  return "Missing coordinate";

              case 'type':
                  if (input.text) {
                      await this.page.keyboard.type(input.text);
                      return await this.takeScreenshotResult("Typed text");
                  }
                  return "Missing text";

              case 'key':
                  if (input.text) {
                      await this.page.keyboard.press(input.text);
                      return await this.takeScreenshotResult("Key pressed");
                  }
                  return "Missing key";

              case 'cursor_position':
                  // Return current cursor position?
                  // Playwright doesn't easily expose this unless we track it.
                  // We can return [0,0] or ignore.
                  return "Cursor position unknown";

              default:
                  return "Unsupported action";
          }
      } catch (e) {
          return `Error executing action: ${(e as Error).message}`;
      }
  }

  private async takeScreenshotResult(text: string): Promise<Array<any>> {
      if (!this.page) return [ { type: "text", text: "Error: Browser not initialized" } ];

      const buffer = await this.page.screenshot({ type: 'png' });
      return [
          {
              type: "image",
              source: {
                  type: "base64",
                  media_type: "image/png",
                  data: buffer.toString('base64'),
              },
          },
          {
              type: "text",
              text: text,
          }
      ];
  }
}
