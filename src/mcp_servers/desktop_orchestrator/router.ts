import { DesktopDriver } from "./types.js";
import { StagehandDriver } from "./drivers/StagehandDriver.js";
import { AnthropicComputerUseDriver } from "./drivers/AnthropicComputerUseDriver.js";
import { OpenAIOperatorDriver } from "./drivers/OpenAIOperatorDriver.js";
import { SkyvernDriver } from "./drivers/SkyvernDriver.js";
import { createLLM } from "../../llm.js";
import { logMetric } from "../../logger.js";

export class DesktopRouter {
  private drivers: Map<string, DesktopDriver> = new Map();
  private preferredBackend: string = "stagehand";
  private llm = createLLM("openai:gpt-4o-mini"); // Use a fast model for routing

  constructor() {
    this.registerDriver(new StagehandDriver());
    this.registerDriver(new AnthropicComputerUseDriver());
    this.registerDriver(new OpenAIOperatorDriver());
    this.registerDriver(new SkyvernDriver());

    // Configurable via env var
    if (process.env.DESKTOP_PREFERRED_BACKEND) {
        this.setPreferredBackend(process.env.DESKTOP_PREFERRED_BACKEND);
    }
  }

  registerDriver(driver: DesktopDriver) {
    this.drivers.set(driver.name, driver);
  }

  setPreferredBackend(name: string) {
    if (this.drivers.has(name)) {
      this.preferredBackend = name;
    } else {
        console.warn(`Attempted to set unknown backend ${name} as preferred.`);
    }
  }

  async selectDriver(taskDescription: string): Promise<DesktopDriver> {
    const start = Date.now();
    let selectedDriverName: string | null = null;
    let routingMethod = "llm";

    // 1. Check for explicit overrides in description
    const descLower = taskDescription.toLowerCase();
    if (descLower.includes("use stagehand")) { selectedDriverName = "stagehand"; routingMethod = "override"; }
    else if (descLower.includes("use anthropic")) { selectedDriverName = "anthropic"; routingMethod = "override"; }
    else if (descLower.includes("use openai")) { selectedDriverName = "openai"; routingMethod = "override"; }
    else if (descLower.includes("use skyvern")) { selectedDriverName = "skyvern"; routingMethod = "override"; }

    // 2. If short/simple, use preferred
    else if (taskDescription.length < 20 && !descLower.includes("complex")) {
        selectedDriverName = this.preferredBackend;
        routingMethod = "heuristic";
    }

    // 3. Use LLM for smart routing
    if (!selectedDriverName) {
        try {
            const response = await this.llm.generate(
                `You are a router for a desktop automation system.
                 Available backends:
                 - stagehand: Fast, local browser automation (default). Good for known selectors, simple flows, or when speed is key.
                 - anthropic: Uses Anthropic's Computer Use API. Good for visual tasks, desktop apps (non-browser), or when no selectors are known.
                 - openai: Uses OpenAI Operator. Good for general browsing.
                 - skyvern: Vision-based automation. Good for "fill form", "navigate complex site" where structure is unknown, or tasks requiring resilience to layout changes.

                 Task: "${taskDescription}"

                 Return ONLY the name of the backend to use (stagehand, anthropic, openai, or skyvern).
                 Default to 'stagehand' if unsure.`,
                [{ role: "user", content: "Route this task." }] // Dummy message
            );

            const choice = (response.message || "").trim().toLowerCase();
            // Handle potential extra text in response
            const validDrivers = ["stagehand", "anthropic", "openai", "skyvern"];
            const found = validDrivers.find(d => choice.includes(d));

            if (found && this.drivers.has(found)) {
                console.log(`[Router] Selected ${found} for task: "${taskDescription}"`);
                selectedDriverName = found;
            }
        } catch (e) {
            console.error("Router LLM failed, using default:", e);
        }
    }

    // Fallback
    if (!selectedDriverName || !this.drivers.has(selectedDriverName)) {
        selectedDriverName = this.preferredBackend;
        if (routingMethod === "llm") routingMethod = "fallback";
    }

    const duration = Date.now() - start;
    await logMetric('desktop_orchestrator', 'routing_decision', duration, {
        task: taskDescription.substring(0, 50),
        selected_driver: selectedDriverName,
        routing_method: routingMethod
    });

    return this.drivers.get(selectedDriverName)!;
  }

  getDriver(name: string): DesktopDriver | undefined {
      return this.drivers.get(name);
  }

  getAvailableDrivers(): string[] {
      return Array.from(this.drivers.keys());
  }
}
