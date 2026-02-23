import { Stagehand } from "@browserbasehq/stagehand";
import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import { chromium, Browser, Page as PlaywrightPage } from "playwright";
import { z } from "zod";

export class StagehandDriver implements DesktopDriver {
  name = "stagehand";
  private stagehand: Stagehand | null = null;
  private playwrightPage: PlaywrightPage | null = null;
  private browser: Browser | null = null; // For fallback

  async init() {
    if (this.stagehand || this.playwrightPage) return;

    console.log("Initializing Stagehand Driver...");
    const start = Date.now();
    try {
      // Try initializing Stagehand first
      this.stagehand = new Stagehand({
        env: "LOCAL",
        verbose: 1,
        // headless option moved to localBrowserLaunchOptions in V3
        localBrowserLaunchOptions: {
          headless: true
        }
      });
      await this.stagehand.init();
      console.log("Stagehand initialized successfully.");
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'success' });
    } catch (e) {
      console.warn("Stagehand library initialization failed, falling back to direct Playwright:", (e as Error).message);
      try {
        // Fallback to direct Playwright
        this.browser = await chromium.launch({ headless: true });
        this.playwrightPage = await this.browser.newPage();
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

      if (this.playwrightPage) {
        console.log(`[Stagehand Fallback] Navigating to ${url}...`);
        await this.playwrightPage.goto(url, { waitUntil: "domcontentloaded" });
      } else if (this.stagehand) {
        console.log(`[Stagehand] Navigating to ${url}...`);
        // V3 uses internal page navigation, exposed via internal methods usually
        // Using `goto` from V3 (might need cast if type def is missing)
        await (this.stagehand as any).goto(url);
      } else {
        throw new Error("Browser not initialized");
      }

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

      console.log(`[Stagehand] Clicking element '${selector}'...`);

      if (this.playwrightPage) {
         console.log(`[Stagehand Fallback] Using direct Playwright click.`);
         await this.playwrightPage.locator(selector).click();
      } else if (this.stagehand) {
         if (this.isCssSelector(selector)) {
             // Try to find a way to click CSS selector directly via act
             console.log(`[Stagehand] Using act with selector for CSS: ${selector}`);
             await this.stagehand.act({ action: "click", selector: selector } as any);
         } else {
             // AI-driven execution
             console.log(`[Stagehand] Detected natural language, using Stagehand AI.`);
             await this.stagehand.act(`Click on ${selector}`);
         }
      } else {
         throw new Error("Browser not initialized");
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

      console.log(`[Stagehand] Typing "${text}" into '${selector}'...`);

      if (this.playwrightPage) {
         console.log(`[Stagehand Fallback] Using direct Playwright type.`);
         await this.playwrightPage.locator(selector).fill(text);
      } else if (this.stagehand) {
         if (this.isCssSelector(selector)) {
             console.log(`[Stagehand] Using act with selector for CSS type: ${selector}`);
             // act might handle type action?
             // Checking definitions: actTool implies act uses AI instructions or action object.
             // Action object structure: { action: "type", selector: ..., arguments: [text] }?
             // Or maybe just pass instruction string to be safe
             await this.stagehand.act(`Type "${text}" into ${selector}`);
         } else {
             console.log(`[Stagehand] Detected natural language, using Stagehand AI.`);
             await this.stagehand.act(`Type "${text}" into ${selector}`);
         }
      } else {
         throw new Error("Browser not initialized");
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
      console.log("[Stagehand] Taking screenshot...");

      let buffer: Buffer | string = "";

      if (this.playwrightPage) {
          buffer = await this.playwrightPage.screenshot({ fullPage: true });
      } else if (this.stagehand) {
          // Access internal page to take screenshot using CDP?
          // Or use observe? observe returns actions.
          // V3 (Stagehand) typically has some way to capture screenshot.
          // Let's check index.d.ts for 'captureScreenshot' or similar.
          // grep "captureScreenshot" showed AgentProvider having it.
          // V3 class has 'private ctx'.
          // Let's try casting to access page.
          const page = (this.stagehand as any).page;
          if (page && page.sendCDP) {
               // Use CDP Page.captureScreenshot
               const res = await page.sendCDP("Page.captureScreenshot", { format: "png" });
               buffer = res.data; // Base64 string
          } else {
              // Try observe?
              // No, screenshot logic is hard without page access.
              // Assume page exists via any cast as verified in index.js source code assignment
              throw new Error("Cannot take screenshot: Stagehand page not accessible");
          }
      } else {
          throw new Error("Browser not initialized");
      }

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'screenshot', status: 'success' });
      return typeof buffer === 'string' ? buffer : buffer.toString("base64");
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'screenshot', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();

      let text = "";

      if (this.playwrightPage) {
          text = await this.playwrightPage.evaluate(() => document.body.innerText);
      } else if (this.stagehand) {
          // Use CDP via internal page
          const page = (this.stagehand as any).page;
          if (page && page.sendCDP) {
              const res = await page.sendCDP("Runtime.evaluate", {
                  expression: "document.body.innerText",
                  returnByValue: true
              });
              text = res.result.value;
          } else {
              // Fallback to extract (AI-based)
               const result = await this.stagehand.extract(
                   "extract all text from the page",
                   z.object({ text: z.string() })
               );
               text = result.text;
          }
      } else {
          throw new Error("Browser not initialized");
      }

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
      }
      if (this.browser) {
          await this.browser.close();
      }
      this.stagehand = null;
      this.playwrightPage = null;
      this.browser = null;
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'failure', error: (e as Error).message });
    }
  }
}
