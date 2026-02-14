import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { ContextManager } from "../src/context_manager.js";
import { existsSync } from "fs";

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
    const cm = new ContextManager(testDir);
    const data = cm.getContextData();
    expect(data.goals).toEqual([]);
    expect(data.constraints).toEqual([]);
    expect(data.recent_changes).toEqual([]);
  });

  it("should save and load context", async () => {
    const cm = new ContextManager(testDir);
    await cm.addGoal("Goal 1");
    await cm.addConstraint("Constraint 1");

    // Create new instance to test loading
    const cm2 = new ContextManager(testDir);
    await cm2.loadContext();
    const data = cm2.getContextData();

    expect(data.goals).toContain("Goal 1");
    expect(data.constraints).toContain("Constraint 1");
  });

  it("should not duplicate goals or constraints", async () => {
    const cm = new ContextManager(testDir);
    await cm.addGoal("Goal 1");
    await cm.addGoal("Goal 1");

    expect(cm.getContextData().goals.length).toBe(1);
  });

  it("should limit recent changes to 10", async () => {
    const cm = new ContextManager(testDir);
    for (let i = 0; i < 15; i++) {
      await cm.logChange(`Change ${i}`);
    }

    const data = cm.getContextData();
    expect(data.recent_changes.length).toBe(10);
    expect(data.recent_changes[9]).toBe("Change 14");
    expect(data.recent_changes[0]).toBe("Change 5");
  });

  it("should generate a context summary", async () => {
    const cm = new ContextManager(testDir);
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
  });

  it("should create .agent directory if it doesn't exist", async () => {
      const cm = new ContextManager(testDir);
      await cm.addGoal("Test Goal");
      const contextPath = join(testDir, ".agent", "context.json");
      expect(existsSync(contextPath)).toBe(true);
  });
});
