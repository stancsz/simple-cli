import { Stagehand, Page } from "@browserbasehq/stagehand";
import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";

export class StagehandDriver implements DesktopDriver {
  name = "stagehand";
  private stagehand: Stagehand | null = null;
  private page: Page | null = null;

  async init() {
    if (!this.stagehand) {
      console.log("Initializing Stagehand Driver...");
      const start = Date.now();
      try {
        this.stagehand = new Stagehand({
          env: "LOCAL",
          verbose: 1,
        });
        await this.stagehand.init();
        this.page = this.stagehand.context.activePage() || null;
        console.log("Stagehand initialized.");
        await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'success' });
      } catch (e) {
        await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'stagehand', status: 'failure', error: (e as Error).message });
        throw e;
      }
    }
  }

  async navigate(url: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");
      console.log(`Navigating to ${url}...`);
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
      console.log(`Clicking element ${selector}...`);
      await this.page.locator(selector).click();
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
      console.log(`Typing "${text}" into ${selector}...`);
      await this.page.locator(selector).fill(text);
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
      console.log("Taking screenshot...");
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
      if (!this.stagehand) throw new Error("Stagehand not initialized");

      console.log(`Executing complex flow: ${goal}`);
      // Stagehand's act method
      await this.stagehand.act(goal);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'stagehand', action: 'execute_complex_flow', status: 'success' });
      return `Successfully executed action: ${goal}`;
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
          this.stagehand = null;
          this.page = null;
      }
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'stagehand', status: 'failure', error: (e as Error).message });
    }
  }
}
