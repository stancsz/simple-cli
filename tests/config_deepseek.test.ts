import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

// Mock fs to ensure no config file is found
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("loadConfig with DeepSeek API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    (existsSync as any).mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should inject DeepSeek env vars into claw agent config if DEEPSEEK_API_KEY is present", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key-config";

    const config = await loadConfig();

    expect(config.agents?.claw).toBeDefined();
    expect(config.agents?.claw?.env).toEqual(expect.objectContaining({
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_API_KEY: "test-key-config",
      ANTHROPIC_MODEL: "deepseek-chat",
    }));
  });

  it("should NOT inject DeepSeek env vars if DEEPSEEK_API_KEY is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const config = await loadConfig();

    expect(config.agents?.claw).toBeDefined();
    expect(config.agents?.claw?.env).toEqual({});
  });
});
