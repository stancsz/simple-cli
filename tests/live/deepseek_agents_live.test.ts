import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Increase timeout for agent interactions
const AGENT_TIMEOUT = 120000;

describe("DeepSeek Agents Live Test", () => {
  const testDir = join(process.cwd(), "temp_deepseek_live_test");

  // Check if API key is present
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const shouldRun = !!apiKey;

  beforeAll(() => {
    if (!shouldRun) return;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir);

    // Initialize git repo for aider compatibility
    spawn("git", ["init"], { cwd: testDir, stdio: "ignore" });
    spawn("git", ["config", "user.email", "test@example.com"], {
      cwd: testDir,
      stdio: "ignore",
    });
    spawn("git", ["config", "user.name", "Test User"], {
      cwd: testDir,
      stdio: "ignore",
    });
  });

  afterAll(() => {
    if (!shouldRun) return;
    // Clean up
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  const runAgent = async (agentName: string, args: string[]) => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(
        "npx",
        ["tsx", join(process.cwd(), "src", "agents", agentName), ...args],
        {
          cwd: testDir,
          // Override NODE_ENV to avoid test-specific behavior in agents
          env: { ...process.env, NODE_ENV: "development" },
          stdio: ["ignore", "inherit", "inherit"], // Ignore stdin to prevent hanging on input
          shell: false,
        },
      );

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Agent ${agentName} timed out`));
      }, AGENT_TIMEOUT);

      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Agent ${agentName} exited with code ${code}`));
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  it.runIf(shouldRun)(
    "deepseek_aider should create a file",
    async () => {
      await runAgent("deepseek_aider.ts", [
        "Create a file named aider.txt with content 'Hello from Aider'",
        "--yes",
      ]);

      const filePath = join(testDir, "aider.txt");
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Hello from Aider");
    },
    AGENT_TIMEOUT + 5000,
  );

  it.runIf(shouldRun)(
    "deepseek_claude should create a file",
    async () => {
      await runAgent("deepseek_claude.ts", [
        "Create a file named claude.txt with content 'Hello from Claude'",
        "--dangerously-skip-permissions",
        "-p",
      ]);

      const filePath = join(testDir, "claude.txt");
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Hello from Claude");
    },
    AGENT_TIMEOUT + 5000,
  );

  // Disabled deepseek_opencode test as the package is missing
  it.skipIf(true)(
    "deepseek_opencode should create a file",
    async () => {
      await runAgent("deepseek_opencode.ts", [
        "Create a file named opencode.txt with content 'Hello from OpenCode'",
      ]);

      const filePath = join(testDir, "opencode.txt");
      expect(existsSync(filePath)).toBe(true);
    },
    AGENT_TIMEOUT + 5000,
  );
});
