import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PersonaEngine } from "../src/persona/engine.js";
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
      signoff: ["Bye Test!"],
      filler: ["Just checking.", "You know?"]
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("transform", () => {
    it("should transform message with greeting, signoff and filler", async () => {
      // Mock Date to be within working hours (e.g. 10:00)
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0)); // Jan 1, 10:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      // Make random deterministic? No, just check contains.
      const transformed = await engine.transform(mockResponse);

      expect(transformed.message).toContain("Hello Test!");
      expect(transformed.message).toContain("Bye Test!");
      expect(transformed.message).toContain("This is a test message.");
    });

    it("should filter response outside working hours", async () => {
      // Mock Date to be outside working hours (e.g. 20:00)
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 20, 0, 0)); // Jan 1, 20:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const transformed = await engine.transform(mockResponse);
      expect(transformed.message).toContain("I am currently offline.");
      expect(transformed.message).toContain("09:00-17:00");
    });

    it("should add emojis if enabled", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      const transformed = await engine.transform(mockResponse);
      expect(transformed.message).toMatch(/(😊|👍|🚀|🤖|💻|✨|💡|🔥)/u);
    });

    it("should fallback to default persona if config missing", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));
      // Simulate missing file
      (existsSync as any).mockReturnValue(false);

      const transformed = await engine.transform(mockResponse);
      // Default persona is Jules, has emojis.
      expect(transformed.message).toMatch(/(😊|👍|🚀|🤖|💻|✨|💡|🔥)/u);
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
  });
});
