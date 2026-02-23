import { Stagehand, Page } from "@browserbasehq/stagehand";

export class StagehandClient {
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;

  async init() {
    if (!this.stagehand) {
      console.log("Initializing Stagehand...");
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
      });
      await this.stagehand.init();
      this.page = this.stagehand.context.activePage() || null;
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
    // Try to use Stagehand's act if selector looks like an instruction,
    // but the prompt implies CSS/XPath selector.
    // We will use Playwright's click for determinism if it's a selector.
    try {
        await this.page.locator(selector).click();
        return `Clicked element ${selector}`;
    } catch (e) {
        // Fallback or better error handling
        throw new Error(`Failed to click ${selector}: ${(e as Error).message}`);
    }
  }

  async type_text(selector: string, text: string) {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log(`Typing "${text}" into ${selector}...`);
    await this.page.locator(selector).fill(text);
    return `Typed text into ${selector}`;
  }

  async take_screenshot() {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    console.log("Taking screenshot...");
    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString("base64");
  }

  async extract_page_text() {
    await this.init();
    if (!this.page) throw new Error("Browser not initialized");
    // Use Stagehand's extract functionality if available, or just innerText
    // Stagehand has `extract` method which uses LLM.
    // But for raw text, innerText is faster and cheaper.
    // The prompt says "extract_page_text", which could mean structured extraction or just text content.
    // Given the tool name, it's likely just text.
    // However, since we are using Stagehand, maybe we should expose its power?
    // "extract_page_text" sounds like simple extraction.
    // Let's stick to simple text extraction for now to match the "desktop" (automation) vibe,
    // rather than "scraping" vibe.
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
