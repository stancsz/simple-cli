import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";

const TEST_DIR = join(process.cwd(), "test_brain_concurrency");

describe("Brain Concurrency", () => {
  let memory: EpisodicMemory;

  beforeEach(async () => {
    process.env.BRAIN_STORAGE_ROOT = join(TEST_DIR, "episodic");
    process.env.MOCK_EMBEDDINGS = "true";

    // Clean up before test
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
    }
    await mkdir(TEST_DIR, { recursive: true });

    memory = new EpisodicMemory(TEST_DIR);
  });

  afterEach(async () => {
    // Clean up after test
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true }).catch(e => console.warn("Failed to cleanup test dir:", e));
    }
    delete process.env.BRAIN_STORAGE_ROOT;
    delete process.env.MOCK_EMBEDDINGS;
  });

  it("should handle concurrent writes to the same company without data loss", async () => {
    const numWrites = 20;
    const company = "acme_corp";

    const startTime = Date.now();

    const tasks = Array.from({ length: numWrites }).map((_, i) => {
      return memory.store(
        `task-${i}`,
        `request-${i}`,
        `solution-${i}`,
        [],
        company
      );
    });

    await Promise.all(tasks);

    const endTime = Date.now();
    console.log(`Completed ${numWrites} concurrent writes in ${endTime - startTime}ms`);

    // Verify count by recalling with a large limit
    // We search for "request" which should match "request-i" embedding-wise in our mock
    const results = await memory.recall("request", numWrites + 10, company);

    expect(results.length).toBe(numWrites);

    // Verify uniqueness of taskIds
    const ids = new Set(results.map(r => r.taskId));
    expect(ids.size).toBe(numWrites);
  });

  it("should handle concurrent writes to different companies", async () => {
    const numWritesPerCompany = 10;
    const companies = ["comp_a", "comp_b", "comp_c"];

    const allTasks: Promise<void>[] = [];

    for (const company of companies) {
      for (let i = 0; i < numWritesPerCompany; i++) {
        allTasks.push(
          memory.store(
            `task-${company}-${i}`,
            `request-${i}`,
            `solution-${i}`,
            [],
            company
          )
        );
      }
    }

    const startTime = Date.now();
    await Promise.all(allTasks);
    const endTime = Date.now();
    console.log(`Completed ${allTasks.length} multi-tenant writes in ${endTime - startTime}ms`);

    for (const company of companies) {
      const results = await memory.recall("request", 100, company);
      expect(results.length).toBe(numWritesPerCompany);
      const ids = results.map(r => r.taskId);
      ids.forEach(id => expect(id).toContain(company));
    }
  });

  it("should fail gracefully if lock cannot be acquired (simulation)", async () => {
    // This is hard to test with real file locks unless we artificially hold one.
    // We can try to manually create a lock file and see if it recovers or fails.

    const company = "locked_company";
    const connector = (memory as any).connector;

    // Manually acquire lock to simulate another process holding it
    // We start an async operation that holds the lock for a while
    const lockPromise = connector.withLock(company, async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return "done";
    });

    // Try to write while locked
    const start = Date.now();
    await memory.store("task-concurrent", "req", "sol", [], company);
    const duration = Date.now() - start;

    await lockPromise;

    // It should have waited at least somewhat, or succeeded after retry
    // Since our retry logic (proper-lockfile) waits up to ~30s (stale) or retries,
    // and we hold it for 2s, it should succeed after ~2s.
    expect(duration).toBeGreaterThan(1000);

    const results = await memory.recall("req", 10, company);
    expect(results.length).toBe(1);
  });
});
