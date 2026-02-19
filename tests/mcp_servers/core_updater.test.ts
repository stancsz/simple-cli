import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

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

describe("CoreUpdaterServer", () => {
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

  it("should read a core file safely", async () => {
    const result: any = await server.readCoreFile({ filepath: "src/normal.ts" });
    expect(result.content[0].text).toBe("original content");
  });

  it("should fail to read non-existent file", async () => {
    const result: any = await server.readCoreFile({ filepath: "src/fake.ts" });
    expect(result.isError).toBe(true);
  });

  it("should fail to read file outside src", async () => {
    // Attempt path traversal
    const result: any = await server.readCoreFile({ filepath: "src/../package.json" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path traversal detected");
  });

  it("should propose a LOW risk core update for normal files", async () => {
    const proposal = {
      title: "Test Update",
      description: "Fixing a bug",
      changes: [{ filepath: "src/normal.ts", newContent: "new content" }]
    };

    const result: any = await server.handleProposal(proposal);
    expect(result.content[0].text).toContain("Proposal Created");
    expect(result.content[0].text).toContain("Risk Level: low");

    // Verify file created
    const idMatch = result.content[0].text.match(/ID: ([a-f0-9-]+)/);
    const id = idMatch[1];
    const storedPath = join(tempDir, ".agent", "pending_updates", `${id}.json`);
    expect(existsSync(storedPath)).toBe(true);
  });

  it("should fail proposal with path traversal", async () => {
     const proposal = {
      title: "Bad Update",
      description: "Attack",
      changes: [{ filepath: "src/../outside.ts", newContent: "malicious" }]
    };
    const result: any = await server.handleProposal(proposal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path traversal detected");
  });

  it("should propose HIGH risk update if Brain recalls failures (risky.ts)", async () => {
    const proposal = {
      title: "Risky Update",
      description: "Fixing a bug",
      changes: [{ filepath: "src/risky.ts", newContent: "new content" }]
    };

    const result: any = await server.handleProposal(proposal);
    expect(result.content[0].text).toContain("Risk Level: high");
  });

  it("should mark changes to builtins.ts as CRITICAL", async () => {
    const proposal = {
      title: "Critical Update",
      description: "Modifying builtins",
      changes: [{ filepath: "src/builtins.ts", newContent: "danger" }]
    };

    const result: any = await server.handleProposal(proposal);
    expect(result.content[0].text).toContain("Risk Level: critical");
  });

  it("should fail apply_core_update without token (Strict Mode)", async () => {
    // 1. Propose Low Risk
    const proposal = {
      title: "Test Update",
      description: "Fixing a bug",
      changes: [{ filepath: "src/normal.ts", newContent: "new content" }]
    };
    const propResult: any = await server.handleProposal(proposal);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];

    // 2. Apply without token
    const applyResult: any = await server.handleApply({ update_id: id });
    expect(applyResult.isError).toBe(true);
    expect(applyResult.content[0].text).toContain("Approval token required");
  });

  it("should apply_core_update with correct token", async () => {
    // 1. Propose
    const proposal = {
      title: "Test Update",
      description: "Fixing a bug",
      changes: [{ filepath: "src/normal.ts", newContent: "new content" }]
    };
    const propResult: any = await server.handleProposal(proposal);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];
    const token = propResult.content[0].text.match(/Approval Token: ([a-zA-Z0-9-]+)/)[1];

    // 2. Apply with token
    const applyResult: any = await server.handleApply({ update_id: id, approval_token: token });
    expect(applyResult.content[0].text).toContain("Update Applied Successfully");

    // 3. Verify file content
    const content = await readFile(join(srcDir, "normal.ts"), "utf-8");
    expect(content).toBe("new content");
  });

  it("should apply LOW risk update in YOLO mode without token", async () => {
    // Mock Config to YOLO
    (loadConfig as any).mockResolvedValue({ yoloMode: true });

    // 1. Propose Low Risk
    const proposal = {
      title: "YOLO Update",
      description: "YOLO",
      changes: [{ filepath: "src/normal.ts", newContent: "yolo content" }]
    };
    const propResult: any = await server.handleProposal(proposal);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];

    expect(propResult.content[0].text).toContain("Risk Level: low");

    // 2. Apply WITHOUT token
    const applyResult: any = await server.handleApply({ update_id: id });

    if (applyResult.isError) {
        console.error("YOLO Apply Error:", applyResult.content[0].text);
    }

    expect(applyResult.isError).toBeUndefined();
    expect(applyResult.content[0].text).toContain("Update Applied Successfully");

    // Verify
    const content = await readFile(join(srcDir, "normal.ts"), "utf-8");
    expect(content).toBe("yolo content");
  });

  it("should FAIL apply CRITICAL update in YOLO mode without token", async () => {
    // Mock Config to YOLO
    (loadConfig as any).mockResolvedValue({ yoloMode: true });

    // 1. Propose Critical
    const proposal = {
      title: "YOLO Critical",
      description: "YOLO but dangerous",
      changes: [{ filepath: "src/builtins.ts", newContent: "danger" }]
    };
    const propResult: any = await server.handleProposal(proposal);
    const id = propResult.content[0].text.match(/ID: ([a-f0-9-]+)/)[1];

    expect(propResult.content[0].text).toContain("Risk Level: critical");

    // 2. Apply WITHOUT token
    const applyResult: any = await server.handleApply({ update_id: id });

    expect(applyResult.isError).toBe(true);
    expect(applyResult.content[0].text).toContain("requires token");
  });
});
