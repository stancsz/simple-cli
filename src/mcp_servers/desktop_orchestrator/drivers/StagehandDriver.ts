import { Stagehand, Page } from "@browserbasehq/stagehand";
import { DesktopDriver } from "../types.js";

export class StagehandDriver implements DesktopDriver {
  name = "stagehand";
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;

  async init() {
    if (!this.stagehand) {
      console.log("Initializing Stagehand Driver...");
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
      });
      await this.stagehand.init();
      this.page = this.stagehand.context.activePage() || null;
      console.log("Stagehand initialized.");
    }
  }

  async navigate(url: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Navigating to ${url}...`);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return `Navigated to ${url}`;
  }

  async click(selector: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Clicking element ${selector}...`);
    try {
        await this.page.locator(selector).click();
        return `Clicked element ${selector}`;
    } catch (e) {
        throw new Error(`Failed to click ${selector}: ${(e as Error).message}`);
    }
  }

  async type(selector: string, text: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Typing "${text}" into ${selector}...`);
    await this.page.locator(selector).fill(text);
    return `Typed text into ${selector}`;
  }

  async screenshot() {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log("Taking screenshot...");
    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString("base64");
  }

  async extract_text() {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    const text = await this.page.evaluate(() => document.body.innerText);
    return text;
  }

  async execute_complex_flow(goal: string) {
      await this.init();
      if (!this.stagehand) throw new Error("Stagehand not initialized");

      console.log(`Executing complex flow: ${goal}`);
      try {
          // Stagehand's act method
          await this.stagehand.act(goal);
          return `Successfully executed action: ${goal}`;
      } catch (e) {
          throw new Error(`Failed to execute flow: ${(e as Error).message}`);
      }
  }

  async shutdown() {
      if (this.stagehand) {
          await this.stagehand.close();
          this.stagehand = null;
          this.page = null;
      }
  }
}
