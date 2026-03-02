import { DesktopDriver } from "./types.js";
import { StagehandDriver } from "./drivers/StagehandDriver.js";
import { AnthropicComputerUseDriver } from "./drivers/AnthropicComputerUseDriver.js";
import { OpenAIOperatorDriver } from "./drivers/OpenAIOperatorDriver.js";
import { SkyvernDriver } from "./drivers/SkyvernDriver.js";
import { createLLM } from "../../llm/index.js";
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
    const descLower = taskDescription.toLowerCase();

    // 0. Identify excluded drivers
    const excludedDrivers: string[] = [];
    if (descLower.includes("avoid stagehand") || descLower.includes("exclude stagehand")) excludedDrivers.push("stagehand");
    if (descLower.includes("avoid anthropic") || descLower.includes("exclude anthropic")) excludedDrivers.push("anthropic");
    if (descLower.includes("avoid openai") || descLower.includes("exclude openai")) excludedDrivers.push("openai");
    if (descLower.includes("avoid skyvern") || descLower.includes("exclude skyvern")) excludedDrivers.push("skyvern");

    // 1. Check for explicit overrides in description (Priority over exclusions, unless conflicting? Let's say explicit use wins)
    if (descLower.includes("use stagehand")) { selectedDriverName = "stagehand"; routingMethod = "override"; }
    else if (descLower.includes("use anthropic")) { selectedDriverName = "anthropic"; routingMethod = "override"; }
    else if (descLower.includes("use openai")) { selectedDriverName = "openai"; routingMethod = "override"; }
    else if (descLower.includes("use skyvern")) { selectedDriverName = "skyvern"; routingMethod = "override"; }

    // If selected via override but is excluded, we honor the override (user said "use X" explicitly)
    // But if no override...

    // 2. If short/simple, use preferred (unless excluded)
    else if (taskDescription.length < 20 && !descLower.includes("complex")) {
        if (!excludedDrivers.includes(this.preferredBackend)) {
            selectedDriverName = this.preferredBackend;
            routingMethod = "heuristic";
        }
    }

    // 3. Use LLM for smart routing
    if (!selectedDriverName) {
        try {
            const validDrivers = ["stagehand", "anthropic", "openai", "skyvern"].filter(d => !excludedDrivers.includes(d));

            if (validDrivers.length === 0) {
                 // All drivers excluded? Fallback to preferred or Stagehand
                 validDrivers.push("stagehand");
            }

            const response = await this.llm.generate(
                `You are a router for a desktop automation system.
                 Available backends:
                 ${validDrivers.includes('stagehand') ? '- stagehand: Fast, local browser automation (default). Good for known selectors, simple flows, or when speed is key.' : ''}
                 ${validDrivers.includes('anthropic') ? '- anthropic: Uses Anthropic\'s Computer Use API. Good for visual tasks, desktop apps (non-browser), or when no selectors are known.' : ''}
                 ${validDrivers.includes('openai') ? '- openai: Uses OpenAI Operator. Good for general browsing.' : ''}
                 ${validDrivers.includes('skyvern') ? '- skyvern: Vision-based automation. Good for "fill form", "navigate complex site" where structure is unknown, or tasks requiring resilience to layout changes.' : ''}

                 Task: "${taskDescription}"
                 ${excludedDrivers.length > 0 ? `Do NOT use: ${excludedDrivers.join(', ')}.` : ''}

                 Return ONLY the name of the backend to use (${validDrivers.join(', ')}).
                 Default to '${validDrivers[0]}' if unsure.`,
                [{ role: "user", content: "Route this task." }] // Dummy message
            );

            const choice = (response.message || "").trim().toLowerCase();
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
