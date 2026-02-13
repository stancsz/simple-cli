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

    // Reset the singleton instance between tests.
    Scheduler.resetInstance();
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
