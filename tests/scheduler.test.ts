import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Scheduler } from "../src/scheduler.js";
import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), "temp_test_scheduler_unit");

describe("Scheduler", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_DIR, { recursive: true });

    // Reset the singleton instance if possible.
    // Since Scheduler is a singleton, we need to be careful.
    // The implementation uses `Scheduler.instance`, which is private static.
    // Ideally we would have a method to reset it for testing, or pass the CWD to getInstance everytime.
    // In `Scheduler.getInstance(cwd)`, it only creates new if instance is null.
    // This is a limitation of the Singleton pattern in testing.
    //
    // WORKAROUND: We can modify the `scheduler.json` path logic or just accept that
    // we might be reusing the instance but pointing it to different data?
    // Actually, the `filePath` is set in the constructor.
    // If the singleton is already created with the default CWD, `getInstance(TEST_DIR)`
    // will return the EXISTING instance with the WRONG CWD.
    //
    // REFLECTION: The current Scheduler implementation is hard to test because of the Singleton pattern
    // without a reset mechanism. I should modify `src/scheduler.ts` to allow resetting
    // or just exposing the constructor for testing?
    // Or better: Allow updating the CWD or reloading.

    // Let's modify the test to manually "reset" the instance by accessing the private property
    // via 'any' casting, which is a common hack in TS testing.
    (Scheduler as any).instance = undefined;
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should schedule a task and persist it", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo hello",
      "Test Task",
    );

    expect(id).toBeDefined();

    const filePath = join(TEST_DIR, ".agent", "scheduler.json");
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content).toHaveLength(1);
    expect(content[0].id).toBe(id);
    expect(content[0].cron).toBe("* * * * *");
    expect(content[0].prompt).toBe("echo hello");
  });

  it("should identify due tasks (catch-up logic)", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo test",
      "Test Task",
    );

    // Initially not due (lastRun is now)
    let due = await scheduler.getDueTasks();
    expect(due).toHaveLength(0);

    // Modify lastRun to 5 minutes ago directly in file
    const filePath = join(TEST_DIR, ".agent", "scheduler.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    content[0].lastRun = Date.now() - 5 * 60 * 1000;
    await writeFile(filePath, JSON.stringify(content, null, 2));

    // Should be due now
    due = await scheduler.getDueTasks();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(id);
  });

  it("should mark task as run and update lastRun", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo test",
      "Test Task",
    );

    // Force it to be due
    const filePath = join(TEST_DIR, ".agent", "scheduler.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    content[0].lastRun = Date.now() - 60000 * 5;
    await writeFile(filePath, JSON.stringify(content, null, 2));

    let due = await scheduler.getDueTasks();
    expect(due).toHaveLength(1);

    // Mark as run
    await scheduler.markTaskRun(id, true);

    // Should not be due anymore
    due = await scheduler.getDueTasks();
    expect(due).toHaveLength(0);

    // Check file for updated lastRun
    const updatedContent = JSON.parse(await readFile(filePath, "utf-8"));
    expect(updatedContent[0].lastRun).toBeGreaterThan(content[0].lastRun);
    expect(updatedContent[0].failureCount).toBe(0);
  });

  it("should increment failure count on failure", async () => {
    const scheduler = Scheduler.getInstance(TEST_DIR);
    const id = await scheduler.scheduleTask(
      "* * * * *",
      "echo test",
      "Test Task",
    );

    await scheduler.markTaskRun(id, false);

    const filePath = join(TEST_DIR, ".agent", "scheduler.json");
    const content = JSON.parse(await readFile(filePath, "utf-8"));
    expect(content[0].failureCount).toBe(1);
  });
});
