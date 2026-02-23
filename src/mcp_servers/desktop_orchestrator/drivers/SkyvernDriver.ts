import { DesktopDriver } from "../types.js";
import { logMetric } from "../../../logger.js";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SkyvernDriver implements DesktopDriver {
  name = "skyvern";
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: any = {};
  private cdpUrl: string | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const configPath = path.resolve(__dirname, "../config.json");
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, "utf-8");
        const json = JSON.parse(fileContent);
        this.config = json.desktop_orchestrator?.drivers?.skyvern || {};
      }
    } catch (e) {
      console.warn("Failed to load config.json for SkyvernDriver:", e);
    }
  }

  async init() {
    if (this.browser) return;

    const start = Date.now();
    try {
      console.log("Initializing Skyvern Driver...");
      const port = this.config.cdp_port || 9222;

      // Launch browser with remote debugging port enabled to allow Skyvern to connect via CDP
      this.browser = await chromium.launch({
        headless: false, // Default to visible for local debugging, consistent with Stagehand
        args: [`--remote-debugging-port=${port}`],
      });

      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();

      // Assume local CDP is reachable at localhost:port
      this.cdpUrl = `http://127.0.0.1:${port}`;

      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'skyvern', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_initialization', Date.now() - start, { driver: 'skyvern', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async navigate(url: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Skyvern] Navigating to ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'navigate', status: 'success' });
      return `[Skyvern] Navigated to ${url}`;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'navigate', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async click(selector: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      // Heuristic: Is it a CSS selector?
      // CSS selectors usually start with #, ., or are tag names.
      // Natural language selectors are sentences or phrases.
      // Improved regex: check for start of string for tags
      const isCss = /^[#.]|^(?:body|div|span|button|input|a|form|img)(?:$|[.#\[: >])/.test(selector);

      if (isCss) {
        console.log(`[Skyvern] Clicking CSS selector: ${selector}`);
        await this.page.click(selector);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'click', status: 'success' });
        return `[Skyvern] Clicked ${selector}`;
      } else {
        // Use Skyvern API for natural language selector
        console.log(`[Skyvern] Clicking visual element: ${selector}`);
        const result = await this.runSkyvernTask(`Click the element described as: ${selector}`, this.page.url());
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'click', status: 'success' });
        return result;
      }
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'click', status: 'failure', error: (e as Error).message });
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
        console.log(`[Skyvern] Typing into CSS selector: ${selector}`);
        await this.page.fill(selector, text);
        await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'type', status: 'success' });
        return `[Skyvern] Typed into ${selector}`;
      } else {
         console.log(`[Skyvern] Typing into visual element: ${selector}`);
         const result = await this.runSkyvernTask(`Type "${text}" into the element described as: ${selector}`, this.page.url());
         await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'type', status: 'success' });
         return result;
      }
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'type', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async screenshot() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const buffer = await this.page.screenshot({ fullPage: true });
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'screenshot', status: 'success' });
      return buffer.toString("base64");
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'screenshot', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async extract_text() {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      const text = await this.page.evaluate(() => document.body.innerText);
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'extract_text', status: 'success' });
      return text;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'extract_text', status: 'failure', error: (e as Error).message });
      throw e;
    }
  }

  async execute_complex_flow(goal: string) {
    const start = Date.now();
    try {
      await this.init();
      if (!this.page) throw new Error("Browser not initialized");

      console.log(`[Skyvern] Executing complex flow: ${goal}`);
      const result = await this.runSkyvernTask(goal, this.page.url());

      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'execute_complex_flow', status: 'success' });
      return result;
    } catch (e) {
      await logMetric('desktop_orchestrator', 'execution_latency', Date.now() - start, { driver: 'skyvern', action: 'execute_complex_flow', status: 'failure', error: (e as Error).message });
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
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'skyvern', status: 'success' });
    } catch (e) {
      await logMetric('desktop_orchestrator', 'driver_shutdown', Date.now() - start, { driver: 'skyvern', status: 'failure', error: (e as Error).message });
    }
  }

  private async runSkyvernTask(prompt: string, url: string): Promise<string> {
      const apiBase = this.config.api_base || "http://localhost:8000";
      const apiKey = this.config.api_key;

      const payload = {
          url: url,
          navigation_goal: prompt,
          cdp_url: this.cdpUrl,
      };

      const headers: Record<string, string> = {
          "Content-Type": "application/json",
      };
      if (apiKey) {
          headers["x-api-key"] = apiKey;
      }

      // Allow overriding API URL for testing
      const apiUrl = process.env.SKYVERN_API_URL || `${apiBase}/api/v1/tasks`;

      console.log(`[Skyvern] Calling API ${apiUrl} with prompt: ${prompt}`);

      try {
          // 1. Create Task
          const createRes = await fetch(apiUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(payload)
          });

          if (!createRes.ok) {
              const txt = await createRes.text();
              throw new Error(`Skyvern API error: ${createRes.status} ${createRes.statusText} - ${txt}`);
          }

          const taskData = await createRes.json();
          const taskId = taskData.task_id;
          console.log(`[Skyvern] Task created: ${taskId}`);

          // 2. Poll for completion
          const maxRetries = 60;
          for (let i = 0; i < maxRetries; i++) {
              await new Promise(r => setTimeout(r, 1000));

              const statusUrl = process.env.SKYVERN_API_URL ? `${process.env.SKYVERN_API_URL}/${taskId}` : `${apiBase}/api/v1/tasks/${taskId}`;
              const statusRes = await fetch(statusUrl, {
                  headers
              });

              if (!statusRes.ok) continue;

              const statusData = await statusRes.json();
              const status = statusData.status;

              if (status === 'completed') {
                  return `Skyvern task completed. Result: ${JSON.stringify(statusData.output || "Success")}`;
              } else if (status === 'failed') {
                  throw new Error(`Skyvern task failed: ${JSON.stringify(statusData.error)}`);
              }
          }
          throw new Error("Skyvern task timed out");

      } catch (e) {
          console.error("Skyvern API interaction failed:", e);
          throw e;
      }
  }
}
