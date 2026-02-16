import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextManager } from "../../src/context_manager.js";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), ".test_agent_" + Date.now());

describe("ContextManager Race Condition", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(join(TEST_DIR, ".agent"), { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
       await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should handle concurrent updates securely", async () => {
    const numWorkers = 20;
    const goals = Array.from({ length: numWorkers }, (_, i) => `Goal ${i}`);

    // Create multiple instances of ContextManager pointing to the same directory
    const managers = Array.from({ length: numWorkers }, () => new ContextManager(TEST_DIR));

    // Execute addGoal concurrently
    await Promise.all(
      managers.map((cm, i) => cm.addGoal(goals[i]))
    );

    // Verify all goals are present
    const finalManager = new ContextManager(TEST_DIR);
    const summary = await finalManager.getContextSummary();

    // Check if all goals are in the summary
    for (const goal of goals) {
      expect(summary).toContain(goal);
    }
  }, 30000); // Increase timeout for retries

  it("should recover from stale lock", async () => {
     const cm = new ContextManager(TEST_DIR);
     const lockFile = join(TEST_DIR, ".agent", "context.json.lock");

     // Manually create a "stale" lock file with an old timestamp
     // We can't easily set mtime in past with writeFile, but we can use utimes
     // However, our logic checks: now - stats.mtimeMs > 30000
     // So we need to make mtimeMs < now - 30000

     const { writeFile, utimes } = await import("fs/promises");
     await writeFile(lockFile, "");

     const oldTime = new Date(Date.now() - 35000);
     await utimes(lockFile, oldTime, oldTime);

     // Now try to acquire lock
     await cm.addGoal("Recovered Goal");

     const summary = await cm.getContextSummary();
     expect(summary).toContain("Recovered Goal");

     // Lock file should be gone (or at least accessible)
  });
});
