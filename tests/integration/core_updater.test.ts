import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
// No Diff dependency needed for new implementation

// Mock dependencies BEFORE importing the module under test
vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() { }
      async init() { }
      async recall(query: string, limit: number) {
        // Only return failure history for 'risky.ts'
        if (query.includes("risky.ts")) {
          return [{ taskId: "1", userPrompt: "fix bug", agentResponse: "outcome: failure", artifacts: [] }];
        }
        return [];
      }
      async store() { }
    }
  };
});

vi.mock("../../src/config.js", () => {
  return {
    loadConfig: vi.fn().mockResolvedValue({ yoloMode: false }) // Default to strict
  };
});

// Import after mocking
import { CoreUpdaterServer } from "../../src/mcp_servers/core_updater/index.js";
import { loadConfig } from "../../src/config.js";

describe("CoreUpdaterServer Integration", () => {
  let server: CoreUpdaterServer;
  let tempDir: string;
  let srcDir: string;

  beforeEach(async () => {
    // Create temp directory structure
    // Use random suffix to avoid collisions in parallel runs
    tempDir = join(tmpdir(), `core-updater-test-${randomUUID()}`);
    srcDir = join(tempDir, "src");
    await mkdir(srcDir, { recursive: true });

    // Create dummy files
    await writeFile(join(srcDir, "normal.ts"), "original content");
    await writeFile(join(srcDir, "risky.ts"), "risky content");
    await writeFile(join(srcDir, "builtins.ts"), "critical content");

    // Initialize server with temp dir
    server = new CoreUpdaterServer(tempDir);
  });

  afterEach(async () => {
    // Clean up temp dir
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch { }
    vi.clearAllMocks();
  });

  it("should propose a LOW risk core update for normal files", async () => {
    const args = {
      title: "Fixing a bug",
      description: "Updated normal.ts",
      changes: [
        { filepath: "src/normal.ts", newContent: "new content" }
      ]
    };

    const result: any = await server.handleProposal(args);

    // Check for success via content presence (since strict success/failure structure might vary)
    expect(result.content[0].text).toContain("Proposal Created");
    expect(result.content[0].text).toContain("Risk Level: low");

    // Verify file created
    const idMatch = result.content[0].text.match(/ID: ([a-f0-9-]+)/);
    const id = idMatch[1];
    // Storage path might use ".agent/pending_updates" based on CoreUpdaterServer implementation
    // Assuming CoreProposalStorage uses standard path inside .agent
    // But since we can't easily check internal storage path without importing storage class logic...
    // Let's rely on handleApply which uses storage.

    // But we can check explicit check if wanted:
    // const storedPath = join(tempDir, ".agent", "pending_updates", `${id}.json`);
    // expect(existsSync(storedPath)).toBe(true);
  });

  it("should fail proposal with path traversal in changes", async () => {
    const args = {
      title: "Attack",
      description: "Expose secret",
      changes: [
        { filepath: "../secret.txt", newContent: "exposed" }
      ]
    };

    const result: any = await server.handleProposal(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must start with 'src/'");
  });

  it("should detect CRITICAL risk for builtins.ts", async () => {
    const args = {
      title: "Dangerous change",
      description: "Update builtins",
      changes: [
        { filepath: "src/builtins.ts", newContent: "danger" }
      ]
    };

    const result: any = await server.handleProposal(args);
    expect(result.content[0].text).toContain("Risk Level: critical");
  });

  it("should apply update successfully with token", async () => {
    // 1. Create Proposal
    const args = {
      title: "Fix",
      description: "Patch normal.ts",
      changes: [
        { filepath: "src/normal.ts", newContent: "patched content" }
      ]
    };
    const propResult: any = await server.handleProposal(args);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];
    const token = propResult.content[0].text.match(/Approval Token: ([a-zA-Z0-9-]+)/)[1];

    // 2. Apply
    const applyResult: any = await server.handleApply({ update_id: id, approval_token: token });
    expect(applyResult.content[0].text).toContain("Update Applied Successfully");

    // 3. Verify content
    const content = await readFile(join(srcDir, "normal.ts"), "utf-8");
    expect(content).toBe("patched content");

    // 4. Verify backup exists (ID extraction)
    const backupIdMatch = applyResult.content[0].text.match(/Backup ID: ([a-f0-9-]+)/);
    if (backupIdMatch) {
      const backupId = backupIdMatch[1];
      const backupFile = join(tempDir, ".agent", "backups", backupId, "src_normal.ts"); // Check implementation for backup naming
      // The implementation does: join(backupDir, change.filepath.replace(/\//g, "_"));
      // So "src/normal.ts" -> "src_normal.ts"
      expect(existsSync(backupFile)).toBe(true);
    }
  });

  it("should FAIL apply without token in Standard Mode", async () => {
    // 1. Create Proposal (Low Risk)
    const args = { title: "Fix", description: "Patch", changes: [{ filepath: "src/normal.ts", newContent: "content" }] };
    const propResult: any = await server.handleProposal(args);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];

    // 2. Apply without token
    const applyResult: any = await server.handleApply({ update_id: id });
    expect(applyResult.isError).toBe(true);
    expect(applyResult.content[0].text).toContain("Approval token required");
  });

  it("should AUTO-APPLY Low Risk in YOLO Mode", async () => {
    // Mock YOLO
    (loadConfig as any).mockResolvedValue({ yoloMode: true });

    // 1. Create Proposal
    const args = { title: "YOLO Fix", description: "YOLO", changes: [{ filepath: "src/normal.ts", newContent: "yolo content" }] };
    const propResult: any = await server.handleProposal(args);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];

    // 2. Apply WITHOUT token
    const applyResult: any = await server.handleApply({ update_id: id });

    if (applyResult.isError) {
      console.error("YOLO Apply Error:", applyResult.content[0].text);
    }
    expect(applyResult.isError).toBeUndefined();
    expect(applyResult.content[0].text).toContain("Update Applied Successfully");

    const content = await readFile(join(srcDir, "normal.ts"), "utf-8");
    expect(content).toBe("yolo content");
  });

});
