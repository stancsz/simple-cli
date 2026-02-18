import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import * as Diff from "diff";

// Mock dependencies BEFORE importing the module under test
vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() {}
      async init() {}
      async recall(query: string, limit: number) {
        // Only return failure history for 'risky.ts'
        if (query.includes("risky.ts")) {
            return [{ taskId: "1", userPrompt: "fix bug", agentResponse: "outcome: failure", artifacts: [] }];
        }
        return [];
      }
      async store() {}
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
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should propose a LOW risk core update for normal files", async () => {
    const originalContent = "original content";
    const newContent = "new content";
    const patch = Diff.createPatch("src/normal.ts", originalContent, newContent);
    const patchPath = join(tempDir, "temp.patch");
    await writeFile(patchPath, patch);

    const args = {
      analysis: "Fixing a bug",
      change_summary: "Updated normal.ts",
      patch_file_path: patchPath
    };

    const result: any = await server.handleProposal(args);
    expect(result.content[0].text).toContain("Proposal Created");
    expect(result.content[0].text).toContain("Risk Level: low");

    // Verify file created
    const idMatch = result.content[0].text.match(/ID: ([a-f0-9-]+)/);
    const id = idMatch[1];
    const storedPath = join(tempDir, ".agent", "pending_updates", `${id}.json`);
    expect(existsSync(storedPath)).toBe(true);

    // Verify stored patch
    const storedPatch = join(tempDir, "src", "mcp_servers", "core_updater", "patches", `${id}.patch`);
    expect(existsSync(storedPatch)).toBe(true);
  });

  it("should fail proposal with path traversal in patch", async () => {
    const patch = `--- a/../secret.txt
+++ b/../secret.txt
@@ -1 +1 @@
-secret
+exposed`;
    const patchPath = join(tempDir, "attack.patch");
    await writeFile(patchPath, patch);

    const args = {
      analysis: "Attack",
      change_summary: "Expose secret",
      patch_file_path: patchPath
    };

    const result: any = await server.handleProposal(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("outside src/");
  });

  it("should detect CRITICAL risk for builtins.ts", async () => {
    const originalContent = "critical content";
    const newContent = "danger";
    const patch = Diff.createPatch("src/builtins.ts", originalContent, newContent);
    const patchPath = join(tempDir, "critical.patch");
    await writeFile(patchPath, patch);

    const args = {
      analysis: "Dangerous change",
      change_summary: "Update builtins",
      patch_file_path: patchPath
    };

    const result: any = await server.handleProposal(args);
    expect(result.content[0].text).toContain("Risk Level: critical");
  });

  it("should apply patch successfully with token", async () => {
    // 1. Create Proposal
    const originalContent = "original content";
    const newContent = "patched content";
    const patch = Diff.createPatch("src/normal.ts", originalContent, newContent);
    const patchPath = join(tempDir, "temp.patch");
    await writeFile(patchPath, patch);

    const args = {
      analysis: "Fix",
      change_summary: "Patch normal.ts",
      patch_file_path: patchPath
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

    // 4. Verify backup
    const backupId = applyResult.content[0].text.match(/Backup ID: ([a-f0-9-]+)/)[1];
    const backupFile = join(tempDir, ".agent", "backups", backupId, "src/normal.ts");
    expect(existsSync(backupFile)).toBe(true);
  });

  it("should FAIL apply without token in Standard Mode", async () => {
    // 1. Create Proposal (Low Risk)
    const patch = Diff.createPatch("src/normal.ts", "original content", "new content");
    const patchPath = join(tempDir, "temp.patch");
    await writeFile(patchPath, patch);

    const args = { analysis: "Fix", change_summary: "Patch", patch_file_path: patchPath };
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
    const patch = Diff.createPatch("src/normal.ts", "original content", "yolo content");
    const patchPath = join(tempDir, "temp.patch");
    await writeFile(patchPath, patch);

    const args = { analysis: "YOLO Fix", change_summary: "YOLO", patch_file_path: patchPath };
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

  it("should ROLLBACK changes if patch application fails midway", async () => {
    // 1. Setup
    const file1Path = join(srcDir, "file1.ts");
    const file2Path = join(srcDir, "file2.ts");
    await writeFile(file1Path, "content A\n");
    await writeFile(file2Path, "content B\n");

    // 2. Create Multi-file Patch
    // Patch 1: Valid
    const patch1 = Diff.createPatch("src/file1.ts", "content A\n", "content A2\n");
    // Patch 2: Invalid (Hunk mismatch because we will change file2 on disk)
    const patch2 = Diff.createPatch("src/file2.ts", "content B\n", "content B2\n");

    const combinedPatch = patch1 + patch2; // createPatch ends with newline
    const patchPath = join(tempDir, "rollback.patch");
    await writeFile(patchPath, combinedPatch);

    // 3. Propose
    const args = { analysis: "Rollback Test", change_summary: "Rollback", patch_file_path: patchPath };
    const propResult: any = await server.handleProposal(args);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];
    const token = propResult.content[0].text.match(/Approval Token: ([a-zA-Z0-9-]+)/)[1];

    // 4. Sabotage file2.ts to cause hunk mismatch
    await writeFile(file2Path, "content CHANGED\n");

    // 5. Apply
    const applyResult: any = await server.handleApply({ update_id: id, approval_token: token });

    // 6. Verify Failure and Rollback
    expect(applyResult.isError).toBe(true);
    expect(applyResult.content[0].text).toContain("rolled back"); // Lowercase check

    // 7. Verify file1.ts is restored (It should have been patched to A2, then rolled back to A)
    const content1 = await readFile(file1Path, "utf-8");
    expect(content1).toBe("content A\n");

    // 8. Verify file2.ts is UNTOUCHED (It was "content CHANGED" before apply, should remain "content CHANGED")
    const content2 = await readFile(file2Path, "utf-8");
    expect(content2).toBe("content CHANGED\n");
  });
});
