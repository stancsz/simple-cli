import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Persona } from "../src/persona.js";
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

describe("Persona", () => {
  let persona: Persona;

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
    persona = new Persona();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("format_response", () => {
    it("should process message with greeting, signoff and filler", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0)); // Jan 1, 10:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await persona.load("config.json");

      const message = "This is a test message.";
      const processed = persona.format_response(message);

      expect(processed).toContain("Hello Test!");
      expect(processed).toContain("Bye Test!");
      expect(processed).toContain("This is a test message.");
    });

    it("should filter response outside working hours", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 20, 0, 0)); // Jan 1, 20:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await persona.load("config.json");

      const processed = persona.format_response("Hello");
      expect(processed).toContain("I am currently offline.");
      expect(processed).toContain("09:00-17:00");
    });

    it("should add emojis if enabled", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await persona.load("config.json");

      const processed = persona.format_response("Hello");
      expect(processed).toMatch(/(😊|👍|🚀|🤖|💻|✨|💡|🔥)/u);
    });

    it("should return original message if config not loaded", () => {
      const message = "Original";
      const processed = persona.format_response(message);
      expect(processed).toBe(message);
    });
  });

  describe("inject_personality", () => {
    it("should inject personality into system prompt", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await persona.load("config.json");

      const systemPrompt = "Original system prompt.";
      const injected = persona.inject_personality(systemPrompt);

      expect(injected).toContain("You are TestBot, a Tester.");
      expect(injected).toContain("Your voice is test.");
      expect(injected).toContain("Your working hours are 09:00-17:00.");
      expect(injected).toContain("Original system prompt.");
    });
  });
});
