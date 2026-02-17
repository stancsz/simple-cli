import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PersonaEngine } from "../src/persona.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { LLMResponse } from "../src/llm.js";

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

  describe("transformResponse", () => {
    it("should process response with greeting, signoff and filler", async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0)); // Jan 1, 10:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: "This is a test message.",
        raw: "raw"
      };

      const promise = engine.transformResponse(response);
      vi.runAllTimers();
      const processed = await promise;

      expect(processed.message).toContain("Hello Test!");
      expect(processed.message).toContain("Bye Test!");
      expect(processed.message).toContain("This is a test message.");
    });

    it("should be deterministic", async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: "This is a test message. It has multiple sentences. To trigger filler.",
        raw: "raw"
      };

      const run1 = await engine.transformResponse({ ...response });
      const run2 = await engine.transformResponse({ ...response });

      expect(run1.message).toBe(run2.message);
    });

    it("should not modify code blocks", async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const codeBlock = "```javascript\nconst x = 1;\nconsole.log('No filler here.');\n```";
      const message = `Here is code.\n${codeBlock}\nEnd.`;
      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: message,
        raw: "raw"
      };

      const processed = await engine.transformResponse(response);

      // Ensure the code block is intact (exact match)
      expect(processed.message).toContain(codeBlock);
    });

    it("should filter response outside working hours", async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.setSystemTime(new Date(2023, 0, 1, 20, 0, 0)); // Jan 1, 20:00 Local Time

      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: "Hello",
        raw: "raw"
      };

      const promise = engine.transformResponse(response);
      vi.runAllTimers();
      const processed = await promise;

      expect(processed.message).toContain("I am currently offline.");
      expect(processed.message).toContain("09:00-17:00");
    });

    it("should allow overnight shifts", async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });

        const overnightConfig = { ...MOCK_CONFIG, working_hours: "22:00-06:00" };
        (existsSync as any).mockReturnValue(true);
        (readFile as any).mockResolvedValue(JSON.stringify(overnightConfig));

        await engine.loadConfig();

        // 23:00 - Should work
        vi.setSystemTime(new Date(2023, 0, 1, 23, 0, 0));
        const res1 = await engine.transformResponse({
            thought: "", tool: "none", args: {}, message: "Hello", raw: ""
        });
        expect(res1.message).not.toContain("I am currently offline");

        // 01:00 - Should work
        vi.setSystemTime(new Date(2023, 0, 2, 1, 0, 0));
        const res2 = await engine.transformResponse({
            thought: "", tool: "none", args: {}, message: "Hello", raw: ""
        });
        expect(res2.message).not.toContain("I am currently offline");

         // 12:00 - Should fail
        vi.setSystemTime(new Date(2023, 0, 2, 12, 0, 0));
        const res3 = await engine.transformResponse({
            thought: "", tool: "none", args: {}, message: "Hello", raw: ""
        });
        expect(res3.message).toContain("I am currently offline");
    });

    it("should add emojis if enabled", async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.setSystemTime(new Date(2023, 0, 1, 10, 0, 0));
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: "Hello",
        raw: "raw"
      };

      const promise = engine.transformResponse(response);
      vi.runAllTimers();
      const processed = await promise;

      expect(processed.message).toMatch(/(😊|👍|🚀|🤖|💻|✨|💡|🔥)/u);
    });

    it("should return original response if config not loaded", async () => {
      const response: LLMResponse = {
        thought: "Thinking...",
        tool: "none",
        args: {},
        message: "Original",
        raw: "raw"
      };
      const processed = await engine.transformResponse(response);
      expect(processed.message).toBe("Original");
    });
  });

  describe("injectPersonality", () => {
    it("should inject personality into system prompt", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();

      const systemPrompt = "Original system prompt.";
      const injected = engine.injectPersonality(systemPrompt);

      expect(injected).toContain("You are TestBot, a Tester.");
      expect(injected).toContain("Your voice is test.");
      expect(injected).toContain("Your working hours are 09:00-17:00.");
      expect(injected).toContain("Original system prompt.");
    });
  });

  describe("getPersonalityDescription", () => {
    it("should return only personality description", async () => {
      (existsSync as any).mockReturnValue(true);
      (readFile as any).mockResolvedValue(JSON.stringify(MOCK_CONFIG));

      await engine.loadConfig();
      const desc = engine.getPersonalityDescription();

      expect(desc).toContain("You are TestBot, a Tester.");
      expect(desc).not.toContain("Original system prompt.");
    });
  });

  describe("simulateTyping", () => {
     it("should call onTyping callback", async () => {
        vi.useFakeTimers();

        // Mock config with noticeable latency
        const configWithLatency = { ...MOCK_CONFIG, response_latency: { min: 200, max: 300 } };
        (existsSync as any).mockReturnValue(true);
        (readFile as any).mockResolvedValue(JSON.stringify(configWithLatency));

        await engine.loadConfig();

        const onTyping = vi.fn();
        const promise = engine.simulateTyping("Response", { min: 200, max: 300 }, onTyping);

        await vi.advanceTimersByTimeAsync(1000);
        await promise;

        expect(onTyping).toHaveBeenCalled();
     });
  });
});
