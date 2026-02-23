import { Stagehand, Page } from "@browserbasehq/stagehand";
import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import { chromium, Browser } from "playwright";

export class StagehandDriver implements DesktopDriver {
  name = "stagehand";
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;
  private browser: Browser | null = null; // For fallback

  async init() {
    if (this.page) return;

    console.log("Initializing Stagehand Driver...");
    const start = Date.now();
    try {
      // Try initializing Stagehand first
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        headless: true,
      });
      await this.stagehand.init();
      this.page = this.stagehand.page;
      console.log("Stagehand initialized successfully.");
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'success' });
    } catch (e) {
      console.warn("Stagehand library initialization failed, falling back to direct Playwright:", (e as Error).message);
      try {
        // Fallback to direct Playwright
        this.browser = await chromium.launch({ headless: true });
        this.page = await this.browser.newPage();
        this.stagehand = null;
        console.log("Stagehand Driver initialized in fallback mode (Playwright only).");
        await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'fallback', error: (e as Error).message });
      } catch (fallbackError) {
         await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'failure', error: (fallbackError as Error).message });
         throw fallbackError;
      }
    }
  }

  private isCssSelector(selector: string): boolean {
    // Heuristic to determine if a string is likely a CSS selector
    return /^[#.]|^(?:body|div|span|button|input|a|form|img|textarea|select)(?:$|[.#\[: >])/.test(selector);
  }

  async navigate(url: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");
      console.log(`[Stagehand] Navigating to ${url}...`);
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'navigate', status: 'success' });
      return `Navigated to ${url}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'navigate', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async click(selector: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Stagehand] Clicking element '${selector}'...`);

      if (this.isCssSelector(selector)) {
        console.log(`[Stagehand] Detected CSS selector, using direct Playwright click.`);
        await this.page.locator(selector).click();
      } else {
        if (this.stagehand) {
             console.log(`[Stagehand] Detected natural language, using Stagehand AI.`);
             await this.stagehand.act(`Click on ${selector}`);
        } else {
            throw new Error(`Stagehand AI not available (fallback mode). Cannot process natural language selector: ${selector}`);
        }
      }

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'click', status: 'success' });
      return `Clicked element ${selector}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'click', status: 'failure', error: (e as Error).message });
      throw new Error(`Failed to click ${selector}: ${(e as Error).message}`);
    }
  }

  async type(selector: string, text: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Stagehand] Typing "${text}" into '${selector}'...`);

      if (this.isCssSelector(selector)) {
        console.log(`[Stagehand] Detected CSS selector, using direct Playwright type.`);
        await this.page.locator(selector).fill(text);
      } else {
        if (this.stagehand) {
            console.log(`[Stagehand] Detected natural language, using Stagehand AI.`);
            await this.stagehand.act(`Type "${text}" into ${selector}`);
        } else {
             throw new Error(`Stagehand AI not available (fallback mode). Cannot process natural language selector: ${selector}`);
        }
      }

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'type', status: 'success' });
      return `Typed text into ${selector}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'type', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async screenshot() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");
      console.log("[Stagehand] Taking screenshot...");
      const buffer = await this.page.screenshot({ fullPage: true });
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'screenshot', status: 'success' });
      return buffer.toString("base64");
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'screenshot', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");
      const text = await this.page.evaluate(() => document.body.innerText);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'extract_text', status: 'success' });
      return text;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'extract_text', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async execute_complex_flow(goal: string) {
    const start = Date.now();
    try {
      await this.init();
      if (this.stagehand) {
          console.log(`[Stagehand] Executing complex flow: ${goal}`);
          await this.stagehand.act(goal);
          await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'execute_complex_flow', status: 'success' });
          return `Successfully executed action: ${goal}`;
      } else {
           throw new Error("Stagehand AI not available (fallback mode). Cannot execute complex flow.");
      }
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'execute_complex_flow', status: 'failure', error: (e as Error).message });
      throw new Error(`Failed to execute flow: ${(e as Error).message}`);
    }
  }

  async shutdown() {
    const start = Date.now();
    try {
      if (this.stagehand) {
          await this.stagehand.close();
      } else if (this.browser) {
          await this.browser.close();
      }
      this.stagehand = null;
      this.page = null;
      this.browser = null;
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'failure', error: (e as Error).message });
    }
  }
}
