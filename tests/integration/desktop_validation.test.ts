import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DesktopRouter } from "../../src/mcp_servers/desktop_orchestrator/router.js";
import { StagehandDriver } from "../../src/mcp_servers/desktop_orchestrator/drivers/StagehandDriver.js";
import { SkyvernDriver } from "../../src/mcp_servers/desktop_orchestrator/drivers/SkyvernDriver.js";
import { DriverValidator } from "../../src/mcp_servers/desktop_orchestrator/validation.js";
import { QualityGate } from "../../src/mcp_servers/desktop_orchestrator/quality_gate.js";
import { LLM } from "../../src/llm.js";
import fs from "fs";

// Mock dependencies
vi.mock("@browserbasehq/stagehand", () => {
  return {
    Stagehand: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      act: vi.fn().mockResolvedValue("Action executed"),
      context: {
        activePage: vi.fn().mockReturnValue({
          goto: vi.fn().mockResolvedValue(undefined),
          locator: vi.fn().mockReturnValue({
            click: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
          }),
          screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
          evaluate: vi.fn().mockResolvedValue("Page content"),
          url: vi.fn().mockReturnValue("https://example.com"),
        }),
      },
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock("playwright", () => {
  return {
    chromium: {
      launch: vi.fn().mockResolvedValue({
        newContext: vi.fn().mockResolvedValue({
          newPage: vi.fn().mockResolvedValue({
            goto: vi.fn().mockResolvedValue(undefined),
            click: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-screenshot")),
            evaluate: vi.fn().mockResolvedValue("Page content"),
            url: vi.fn().mockReturnValue("https://example.com"),
          }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

// Mock LLM
vi.mock("../../src/llm.js", () => {
  const MockLLM = vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockImplementation(async (prompt, history) => {
      // Router check: The prompt contains the task description
      if (typeof prompt === 'string' && prompt.includes("You are a router")) {
          // The prompt template contains descriptions of drivers which include words like "vision".
          // We must match the Task section specifically.
          if (prompt.includes('Task: "navigate complex site')) return { message: "skyvern" };
          if (prompt.includes('Task: "use skyvern')) return { message: "skyvern" };

          return { message: "stagehand" };
      }

      // QualityGate check: The prompt is the system prompt
      if (typeof prompt === 'string' && prompt.includes("Senior Visual Design Critic")) {
        return {
          message: JSON.stringify({
            score: 85,
            critique: ["Good layout", "Minor spacing issue"],
            reasoning: "Professional look",
          }),
        };
      }

      return { message: "default response" };
    }),
  }));

  return {
    LLM: MockLLM,
    createLLM: vi.fn().mockImplementation(() => new MockLLM()),
  };
});

// Mock global fetch for Skyvern API
global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/tasks")) {
        // Create task response or poll response
        if (url.endsWith("/tasks")) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ task_id: "task-123" }),
            });
        }
        // Status check
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: "completed", output: "Task done" }),
        });
    }
    return Promise.resolve({ ok: false });
}) as any;

describe("Desktop Orchestrator Integration", () => {
  let router: DesktopRouter;
  let validator: DriverValidator;

  beforeEach(() => {
    router = new DesktopRouter();
    validator = new DriverValidator();
    vi.clearAllMocks();
  });

  describe("Driver Validation", () => {
    it("should validate Stagehand driver", async () => {
      const driver = new StagehandDriver();
      const result = await validator.validate(driver);

      expect(result.driver).toBe("stagehand");
      expect(result.success).toBe(true);
      expect(result.checks.initialization).toBe(true);
      expect(result.checks.navigation).toBe(true);
      expect(result.checks.extraction).toBe(true);
      expect(result.checks.screenshot).toBe(true);
    });

    it("should validate Skyvern driver", async () => {
      const driver = new SkyvernDriver();
      const result = await validator.validate(driver);

      expect(result.driver).toBe("skyvern");
      expect(result.success).toBe(true);
      // Skyvern driver uses playwright mock
      expect(result.checks.navigation).toBe(true);
    });
  });

  describe("Routing Logic", () => {
    it("should route simple tasks to preferred backend (Stagehand)", async () => {
      const driver = await router.selectDriver("navigate to google.com");
      expect(driver.name).toBe("stagehand");
    });

    it("should route complex/vision tasks to Skyvern", async () => {
      const driver = await router.selectDriver("navigate complex site and extract data using vision");
      // The mock LLM returns "skyvern" for "vision" keyword
      expect(driver.name).toBe("skyvern");
    });

    it("should respect explicit overrides", async () => {
        const driver = await router.selectDriver("use skyvern to go to google.com");
        expect(driver.name).toBe("skyvern");
    });
  });

  describe("Quality Gate", () => {
    it("should assess screenshot quality", async () => {
      const gate = new QualityGate();
      const result = await gate.assess("base64data", "landing page");

      expect(result.score).toBe(85);
      expect(result.critique).toContain("Good layout");
      expect(result.reasoning).toBe("Professional look");
    });

    it("should handle technical penalties", async () => {
        const gate = new QualityGate();
        // Mock LLM returns 85. Tech check penalties: No viewport (-15), No CSS vars (-10) = -25.
        // Formula: (85 * 0.7) + (75 * 0.3) = 59.5 + 22.5 = 82.
        // Wait, tech score starts at 100. -25 => 75.

        // Let's pass HTML content that triggers penalties
        const badHtml = "<html><body>No meta tags here</body></html>";
        const result = await gate.assess("base64data", "landing page", badHtml);

        // Calculation:
        // Visual Score (from LLM): 85
        // Tech Score: 100 - 15 (viewport) - 10 (css vars) = 75
        // Final: 85*0.7 + 75*0.3 = 59.5 + 22.5 = 82

        expect(result.score).toBe(82);
        expect(result.reasoning).toContain("Technical penalties");
    });
  });

  describe("Workflow Execution (Mocked)", () => {
      it("should execute a complex flow via Skyvern", async () => {
          const driver = new SkyvernDriver();
          const result = await driver.execute_complex_flow("Buy a ticket");
          expect(result).toContain("Task done");
      });
  });
});
