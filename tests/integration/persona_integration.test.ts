import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PersonaEngine } from "../../src/persona.js";
import { join } from "path";
import { writeFile, unlink, readFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";

describe("PersonaEngine Integration", () => {
  let engine: PersonaEngine;
  const testConfigPath = join(process.cwd(), "persona.json");
  // Read synchronously to avoid top-level await in describe
  const originalConfigContent = existsSync(testConfigPath)
    ? readFileSync(testConfigPath, "utf-8")
    : null;

  beforeEach(() => {
    // Reset singleton instance if possible or just create new one for testing logic
    engine = new PersonaEngine(process.cwd());
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Restore config
    if (originalConfigContent) {
      await writeFile(testConfigPath, originalConfigContent);
    } else {
       if (existsSync(testConfigPath)) await unlink(testConfigPath);
    }
  });

  it("should load configuration from persona.json", async () => {
    const config = {
      name: "TestBot",
      role: "Tester",
      voice: { tone: "friendly" },
      working_hours: "09:00-17:00",
      response_latency: { min_ms: 100, max_ms: 200 }
    };
    await writeFile(testConfigPath, JSON.stringify(config));

    await engine.loadConfig();
    const loaded = engine.getConfig();

    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe("TestBot");
    expect(loaded?.voice.tone).toBe("friendly");
  });

  it("should inject personality into system prompt", async () => {
    const config = {
      name: "TestBot",
      role: "Tester",
      voice: { tone: "friendly", catchphrases: ["Bazinga!"] },
      working_hours: "09:00-17:00"
    };
    await writeFile(testConfigPath, JSON.stringify(config));
    await engine.loadConfig();

    const prompt = "Act as a coding assistant.";
    const injected = engine.injectPersonality(prompt);

    expect(injected).toContain("You are TestBot");
    expect(injected).toContain("Tester");
    expect(injected).toContain("friendly");
    expect(injected).toContain("09:00-17:00");
    expect(injected).toContain("Bazinga!");
    expect(injected).toContain(prompt);
  });

  it("should simulate latency within bounds", async () => {
    const config = {
      name: "TestBot",
      role: "Tester",
      voice: { tone: "friendly" },
      response_latency: { min_ms: 1000, max_ms: 1000 } // Fixed 1s
    };
    await writeFile(testConfigPath, JSON.stringify(config));
    await engine.loadConfig();

    const start = Date.now();
    const promise = engine.simulateLatency();

    // Advance time
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
  });

  it("should correctly identify working hours", async () => {
    const config = {
      name: "TestBot",
      role: "Tester",
      voice: { tone: "friendly" },
      working_hours: "09:00-17:00"
    };
    await writeFile(testConfigPath, JSON.stringify(config));
    await engine.loadConfig();

    // Mock time to 10:00
    const date = new Date(2023, 1, 1, 10, 0, 0);
    vi.setSystemTime(date);

    let status = engine.getWorkingHoursStatus();
    expect(status.isWorkingHours).toBe(true);

    // Mock time to 18:00
    const date2 = new Date(2023, 1, 1, 18, 0, 0);
    vi.setSystemTime(date2);

    status = engine.getWorkingHoursStatus();
    expect(status.isWorkingHours).toBe(false);
  });

  it("should generate appropriate reactions", async () => {
    const config = {
      name: "TestBot",
      role: "Tester",
      voice: { tone: "friendly", emoji_usage: "moderate" }
    };
    await writeFile(testConfigPath, JSON.stringify(config));
    await engine.loadConfig();

    expect(engine.generateReaction("This is a bug")).toBe("🐛");
    expect(engine.generateReaction("Great job")).toBe("👍");
    expect(engine.generateReaction("deploy this")).toBe("🚀");
  });
});
