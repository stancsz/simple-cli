import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonaEngine } from "../src/persona.js";
import { LLMResponse } from "../src/llm.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

describe("PersonaEngine", () => {
  let engine: PersonaEngine;
  const mockResponse: LLMResponse = {
    thought: "thinking",
    tool: "none",
    args: {},
    message: "This is a test message.",
    raw: "raw"
  };

  const MOCK_CONFIG = {
    name: "TestBot",
    role: "Tester",
    voice: {
      tone: "test"
    },
    emoji_usage: true,
    catchphrases: {
      greeting: ["Hello Test!"],
      signoff: ["Bye Test!"]
    },
    working_hours: "09:00-17:00",
    response_latency: {
      min: 10,
      max: 20
    },
    enabled: true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PersonaEngine();
  });

  describe("transform", () => {
    it("should transform message with greeting and signoff", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const transformed = await engine.transform(mockResponse);

      expect(transformed.message).toContain("Hello Test!");
      expect(transformed.message).toContain("Bye Test!");
      expect(transformed.message).toContain("This is a test message.");
    });

    it("should add emojis if enabled", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const transformed = await engine.transform(mockResponse);
      expect(transformed.message).toMatch(/(😊|👍|🚀|🤖|💻|✨)/u);
    });

    it("should not transform if disabled", async () => {
      const disabledConfig = { ...MOCK_CONFIG, enabled: false };
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(disabledConfig));

      const transformed = await engine.transform(mockResponse);
      expect(transformed.message).toBe("This is a test message.");
    });

    it("should simulate latency", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const start = Date.now();
      await engine.transform(mockResponse);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(10);
    });

    it("should handle missing config gracefully", async () => {
      (existsSync as any).mockReturnValue(false);

      const transformed = await engine.transform(mockResponse);
      expect(transformed.message).toBe("This is a test message.");
    });
  });

  describe("injectPersonality", () => {
    it("should inject personality into system prompt", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const systemPrompt = "Original system prompt.";
      const injected = await engine.injectPersonality(systemPrompt);

      expect(injected).toContain("You are TestBot, a Tester.");
      expect(injected).toContain("Your voice is test.");
      expect(injected).toContain("Your working hours are 09:00-17:00.");
      expect(injected).toContain("Original system prompt.");
    });

    it("should not inject personality if disabled", async () => {
      const disabledConfig = { ...MOCK_CONFIG, enabled: false };
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(disabledConfig));

      const systemPrompt = "Original system prompt.";
      const injected = await engine.injectPersonality(systemPrompt);

      expect(injected).toBe("Original system prompt.");
    });

    it("should handle missing config gracefully", async () => {
      (existsSync as any).mockReturnValue(false);

      const systemPrompt = "Original system prompt.";
      const injected = await engine.injectPersonality(systemPrompt);

      expect(injected).toBe("Original system prompt.");
    });
  });
});
