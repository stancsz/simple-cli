import { DesktopBackend } from "../interfaces/DesktopBackend.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { Page } from "playwright";

export class StagehandBackend implements DesktopBackend {
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;

  async init() {
    if (!this.stagehand) {
      console.log("Initializing Stagehand Backend...");
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        debugDom: true,
      });
      await this.stagehand.init();
      this.page = this.stagehand.page;
      console.log("Stagehand initialized.");
    }
  }

  async navigate_to(url: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Navigating to ${url}...`);
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    return `Navigated to ${url}`;
  }

  async click_element(selector: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Clicking element ${selector}...`);
    try {
        await this.page.click(selector);
        return `Clicked element ${selector}`;
    } catch (e) {
        throw new Error(`Failed to click ${selector}: ${(e as Error).message}`);
    }
  }

  async type_text(selector: string, text: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Typing "${text}" into ${selector}...`);
    await this.page.fill(selector, text);
    return `Typed text into ${selector}`;
  }

  async take_screenshot(): Promise<string> {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log("Taking screenshot...");
    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString("base64");
  }

  async extract_page_text() {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    const text = await this.page.evaluate(() => document.body.innerText);
    return text;
  }

  async shutdown() {
      if (this.stagehand) {
          await this.stagehand.close();
          this.stagehand = null;
          this.page = null;
      }
  }
}
