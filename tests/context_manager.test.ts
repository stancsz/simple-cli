import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ContextManager } from "../src/mcp_servers/context_manager/index.js";
import { existsSync } from "fs";

// Mock embedding model for test
const mockEmbeddingModel = {
  specificationVersion: 'v2',
  provider: 'mock',
  modelId: 'mock-embedding',
  doEmbed: async ({ values }: any) => {
    return {
      embeddings: values.map(() => Array(1536).fill(0).map(() => Math.random())),
      usage: { tokens: 10 },
      warnings: []
    };
  }
};

describe("ContextManager", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-context-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should initialize with empty data", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    const data = cm.getContextData();
    expect(data.goals).toEqual([]);
    expect(data.constraints).toEqual([]);
    expect(data.recent_changes).toEqual([]);
    cm.close();
  });

  it("should save and load context", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    await cm.addGoal("Goal 1");
    await cm.addConstraint("Constraint 1");
    cm.close();

    // Create new instance to test loading
    const cm2 = new ContextManager(testDir, mockEmbeddingModel);
    await cm2.loadContext();
    const data = cm2.getContextData();

    expect(data.goals).toContain("Goal 1");
    expect(data.constraints).toContain("Constraint 1");
    cm2.close();
  });

  it("should not duplicate goals or constraints", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    await cm.addGoal("Goal 1");
    await cm.addGoal("Goal 1");

    expect(cm.getContextData().goals.length).toBe(1);
    cm.close();
  });

  it("should limit recent changes to 10", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    for (let i = 0; i < 15; i++) {
      await cm.logChange(`Change ${i}`);
    }

    const data = cm.getContextData();
    expect(data.recent_changes.length).toBe(10);
    expect(data.recent_changes[9]).toBe("Change 14");
    expect(data.recent_changes[0]).toBe("Change 5");
    cm.close();
  });

  it("should generate a context summary", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    await cm.addGoal("Fix bugs");
    await cm.addConstraint("No breaking changes");
    await cm.logChange("Refactored auth");

    const summary = await cm.getContextSummary();
    expect(summary).toContain("## Current Goals");
    expect(summary).toContain("- Fix bugs");
    expect(summary).toContain("## Constraints & Guidelines");
    expect(summary).toContain("- No breaking changes");
    expect(summary).toContain("## Recent Architectural Changes");
    expect(summary).toContain("- Refactored auth");
    cm.close();
  });

  it("should create .agent directory if it doesn't exist", async () => {
    const cm = new ContextManager(testDir, mockEmbeddingModel);
    await cm.addGoal("Test Goal");
    const contextPath = join(testDir, ".agent", "context.json");
    expect(existsSync(contextPath)).toBe(true);
    cm.close();
  });
});
