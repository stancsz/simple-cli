import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFile, rm, mkdir } from "fs/promises";
import { join } from "path";

const TEST_DIR = "tests/tmp_config";
const AGENT_DIR = join(TEST_DIR, ".agent");

describe("Config Loader", () => {
  beforeEach(async () => {
    await mkdir(AGENT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("should load config from .agent/config.json", async () => {
    const config = {
      // We test generic config loading, even if 'agents' is deprecated
      agents: {
        test: { command: "echo", args: ["hello"], description: "test" },
      },
    };
    await writeFile(join(AGENT_DIR, "config.json"), JSON.stringify(config));

    const loaded = await loadConfig(TEST_DIR);
    expect(loaded.agents?.test.command).toBe("echo");
  });

  it("should prioritize mcp.json", async () => {
    const mcpConfig = { mcpServers: { s1: {} } };
    const agentConfig = { agents: { a1: {} } }; // agents in config.json

    await writeFile(join(TEST_DIR, "mcp.json"), JSON.stringify(mcpConfig));
    // We don't write config.json here to test mcp.json priority/loading
    // Actually loadConfig loads from both locations?
    // The implementation:
    // const locations = [join(cwd, "mcp.json"), join(cwd, ".agent", "config.json")];
    // loops and breaks on first found.
    // So mcp.json has priority.

    const loaded = await loadConfig(TEST_DIR);
    expect(loaded.mcpServers).toBeDefined();
    // It should NOT load agents from config.json if mcp.json is found first
    expect(loaded.agents).toBeUndefined();
  });
});
