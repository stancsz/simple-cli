import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ContextServer } from "../../src/mcp_servers/context_server/index.js";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// Mock EpisodicMemory to avoid real DB/LLM calls
vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      recall = vi.fn().mockResolvedValue([
        {
          taskId: "mock-task",
          timestamp: Date.now(),
          userPrompt: "mock prompt",
          agentResponse: "mock response",
          artifacts: ["mock-artifact"]
        }
      ]);
      store = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe("Context Server Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = join(tmpdir(), `context-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
    if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true });
    }
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should handle concurrent updates across different fields without data loss", async () => {
    const server = new ContextServer(tempDir);
    // Initialize context
    await server.updateContext({ goals: [], constraints: [], recent_changes: [], active_tasks: [] });

    const updates = [
      { goals: ["goal-1"] },
      { constraints: ["constraint-1"] },
      { recent_changes: ["change-1"] },
      { active_tasks: ["task-1"] }
    ];

    // Create multiple server instances pointing to the same directory
    // This simulates multiple processes accessing the same file
    const servers = updates.map(() => new ContextServer(tempDir));

    // Execute updates concurrently
    await Promise.all(servers.map((s, i) => s.updateContext(updates[i])));

    // Verify final state
    const result = await server.readContext();

    expect(result.goals).toEqual(["goal-1"]);
    expect(result.constraints).toEqual(["constraint-1"]);
    expect(result.recent_changes).toEqual(["change-1"]);
    expect(result.active_tasks).toEqual(["task-1"]);
  });

  it("should integrate with Brain and return enriched context", async () => {
    const server = new ContextServer(tempDir);

    // Test getContextWithMemory
    const result = await server.getContextWithMemory("some query");

    expect(result.relevant_past_experiences).toBeDefined();
    expect(result.relevant_past_experiences).toHaveLength(1);
    expect(result.relevant_past_experiences![0]).toContain("mock prompt");
  });
});
