import { describe, it, expect, vi, beforeEach } from "vitest";
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
    // Emojis are appended at the end or somewhere.
    // Check for any of the emojis we use: 😊, 👍, 🚀, 🤖, 💻, ✨
    // Broad emoji regex or specific check
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
