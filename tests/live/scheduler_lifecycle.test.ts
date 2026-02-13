import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Scheduler } from "../../src/scheduler.js";
import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), "temp_test_scheduler_live");

describe("Scheduler Lifecycle (Live)", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });
    (Scheduler as any).instance = undefined;
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should automatically forget a task after 3 consecutive failures", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo fail",
      "Failing Task",
    );

    // Simulate 3 failures
    for (let i = 0; i < 3; i++) {
      // Force task to be due
      const filePath = join(TEST_DIR, ".agent", "scheduler.json");
      const content = JSON.parse(await readFile(filePath, "utf-8"));
      content[0].lastRun = Date.now() - 5 * 60 * 1000;
      await writeFile(filePath, JSON.stringify(content, null, 2));

      // Verify task is due
      const due = await scheduler.getDueTasks();
      expect(due).toHaveLength(1);
      expect(due[0].id).toBe(id);

      // Mark as failed
      await scheduler.markTaskRun(id, false);
    }

    // Verify task is now disabled
    const filePath = join(TEST_DIR, ".agent", "scheduler.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content[0].failureCount).toBe(3);
    expect(content[0].enabled).toBe(false);

    // Verify it is NOT returned as due even if time passes
    content[0].lastRun = Date.now() - 10 * 60 * 1000;
    await writeFile(filePath, JSON.stringify(content, null, 2));

    const dueAfterDisable = await scheduler.getDueTasks();
    expect(dueAfterDisable).toHaveLength(0);
  });

  it("should reset failure count on success", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo success",
      "Good Task",
    );

    // Fail twice
    for (let i = 0; i < 2; i++) {
      await scheduler.markTaskRun(id, false);
    }

    let content = JSON.parse(
      await readFile(join(TEST_DIR, ".agent", "scheduler.json"), "utf-8"),
    );
    expect(content[0].failureCount).toBe(2);
    expect(content[0].enabled).toBe(true);

    // Succeed once
    await scheduler.markTaskRun(id, true);

    content = JSON.parse(
      await readFile(join(TEST_DIR, ".agent", "scheduler.json"), "utf-8"),
    );
    expect(content[0].failureCount).toBe(0);
    expect(content[0].enabled).toBe(true);
  });
});
