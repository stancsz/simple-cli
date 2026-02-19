import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join, resolve } from "path";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// Mock dependencies
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, cb) => {
    if (cb) cb(null, "stdout", "stderr");
    return { stdout: "stdout", stderr: "stderr" };
  }),
}));

// Mock EpisodicMemory
const mockMemoryStore = vi.fn();
const mockMemoryRecall = vi.fn().mockResolvedValue([]);
vi.mock("../../src/brain/episodic.ts", () => {
  return {
    EpisodicMemory: vi.fn().mockImplementation(() => ({
      store: mockMemoryStore,
      recall: mockMemoryRecall,
      init: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// Import the server class (using relative path to where test file will be)
import { CoreUpdaterServer } from "../../src/mcp_servers/core_updater/index.js";
import { CoreProposalStorage } from "../../src/mcp_servers/core_updater/storage.js";

describe("Core Updater Integration", () => {
  let tempDir: string;
  let server: CoreUpdaterServer;
  let execMock: any;

  beforeEach(async () => {
    // Create temp directory structure
    tempDir = join(tmpdir(), `core-updater-test-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, ".agent"), { recursive: true });

    // Mock config
    await writeFile(join(tempDir, "mcp.json"), JSON.stringify({ yoloMode: false }));

    // Create a dummy file in src/
    await writeFile(join(tempDir, "src", "dummy.ts"), "original content");

    // Initialize server with tempDir
    server = new CoreUpdaterServer(tempDir);

    // Get mock reference
    const cp = await import("child_process");
    execMock = cp.exec;
    execMock.mockClear();
    mockMemoryStore.mockClear();
    mockMemoryRecall.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should propose a core update successfully", async () => {
    const tools = (server as any).server._tools; // Access private tools map if needed, or call via server
    // McpServer doesn't expose tools directly easily for unit testing without connection.
    // But we can call the tool handler directly if we access the registered tools.
    // Alternatively, we can use the `proposeCoreUpdate` function directly, but better to go through server setup?
    // The server sets up tools using `this.server.tool(...)`.
    // The McpServer SDK might not expose registered tools publicly.
    // Let's rely on the internal functions or cast to any.

    // Hack to get the tool callback
    const toolMap = (server as any).server._toolHandlers;
    // Wait, SDK version might differ. Let's inspect.
    // If we can't easily access tools, we can import the tool functions directly and test them,
    // passing the server's storage/memory.
    // The server instance has `storage` and `memory` private properties.

    // Let's assume we can import the tool functions to test logic,
    // OR we use `server.server.callTool` if available.
    // Checking `McpServer` definition... usually has `callTool`.
    // But `callTool` is for clients. The server *handles* tools.

    // Strategy: Test via `server.handleProposal` if I exposed it, but I refactored to use `tools/`.
    // So I should import the tools directly for testing logic, or inspect `server` internals.
    // Accessing `(server as any).storage` is fine for tests.

    // Let's import the tool functions to be sure.
    const { proposeCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/propose_core_update.js");
    const { applyCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/apply_core_update.js");

    const storage = (server as any).storage;
    const memory = (server as any).memory;

    const result = await proposeCoreUpdate({
      description: "Test update",
      file_path: "src/dummy.ts",
      new_content: "new content",
      reasoning: "Fix bug"
    }, storage, memory, tempDir);

    expect(result.content[0].text).toContain("Proposal Created");
    const id = result.content[0].text.match(/ID: ([^\n]+)/)?.[1];
    expect(id).toBeDefined();

    // Verify storage
    const stored = await storage.get(id!);
    expect(stored).toBeDefined();
    expect(stored?.title).toContain("Test update");
    expect(stored?.changes[0].newContent).toBe("new content");
  });

  it("should reject proposals outside src/", async () => {
    const { proposeCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/propose_core_update.js");
    const storage = (server as any).storage;
    const memory = (server as any).memory;

    const result = await proposeCoreUpdate({
      description: "Bad update",
      file_path: "package.json", // Outside src/
      new_content: "hacked",
      reasoning: "Bad"
    }, storage, memory, tempDir);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must start with 'src/'");
  });

  it("should apply update with valid token", async () => {
    const { proposeCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/propose_core_update.js");
    const { applyCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/apply_core_update.js");
    const storage = (server as any).storage;
    const memory = (server as any).memory;

    // Create proposal
    const propResult = await proposeCoreUpdate({
      description: "Valid update",
      file_path: "src/dummy.ts",
      new_content: "updated content",
      reasoning: "Valid"
    }, storage, memory, tempDir);

    const id = propResult.content[0].text.match(/ID: ([^\n]+)/)?.[1];
    const token = propResult.content[0].text.match(/Approval Token: ([^\n]+)/)?.[1];

    // Apply
    const result = await applyCoreUpdate({
      proposal_id: id!,
      approval_token: token!
    }, storage, memory, tempDir);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Applied Successfully");

    // Verify file changed
    const content = await readFile(join(tempDir, "src/dummy.ts"), "utf-8");
    expect(content).toBe("updated content");

    // Verify backup created
    const backupId = result.content[0].text.match(/Backup ID: ([^\n]+)/)?.[1];
    expect(backupId).toBeDefined();
    const backupFile = join(tempDir, "src", `backup_${backupId}`, "src_dummy.ts");
    expect(existsSync(backupFile)).toBe(true);
    const backupContent = await readFile(backupFile, "utf-8");
    expect(backupContent).toBe("original content");

    // Verify memory log
    expect(mockMemoryStore).toHaveBeenCalled();
  });

  it("should apply update in YOLO mode without token (low risk)", async () => {
    const { proposeCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/propose_core_update.js");
    const { applyCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/apply_core_update.js");
    const storage = (server as any).storage;
    const memory = (server as any).memory;

    // Enable YOLO
    await writeFile(join(tempDir, "mcp.json"), JSON.stringify({ yoloMode: true }));

    // Create proposal
    const propResult = await proposeCoreUpdate({
      description: "YOLO update",
      file_path: "src/dummy.ts",
      new_content: "yolo content",
      reasoning: "YOLO"
    }, storage, memory, tempDir);

    const id = propResult.content[0].text.match(/ID: ([^\n]+)/)?.[1];

    // Apply without token
    const result = await applyCoreUpdate({
      proposal_id: id!
    }, storage, memory, tempDir);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Applied Successfully");

    const content = await readFile(join(tempDir, "src/dummy.ts"), "utf-8");
    expect(content).toBe("yolo content");
  });

  it("should revert if syntax check fails", async () => {
    const { proposeCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/propose_core_update.js");
    const { applyCoreUpdate } = await import("../../src/mcp_servers/core_updater/tools/apply_core_update.js");
    const storage = (server as any).storage;
    const memory = (server as any).memory;

    // Mock exec to fail
    execMock.mockImplementation((cmd: string, opts: any, cb: any) => {
      if (cmd.includes("tsc")) {
        const err = new Error("Syntax Error");
        (err as any).stdout = "Syntax Error details";
        if (cb) cb(err, "stdout", "stderr");
        throw err; // For promisify
      }
      if (cb) cb(null, "", "");
      return { stdout: "", stderr: "" };
    });

    // Need to re-mock promisify? No, promisify wraps the mock.
    // Wait, `promisify(exec)` wraps the function. If I mock `exec` directly, `promisify` (already imported) might be wrapping the original function if I didn't mock it before import.
    // But `child_process` is mocked via `vi.mock` at top level. So `promisify` should wrap the mock.
    // However, `promisify` behavior depends on the callback.
    // My mock calls the callback. So `promisify` should resolve/reject based on callback.

    const propResult = await proposeCoreUpdate({
      description: "Broken update",
      file_path: "src/dummy.ts",
      new_content: "broken content",
      reasoning: "Broken"
    }, storage, memory, tempDir);

    const id = propResult.content[0].text.match(/ID: ([^\n]+)/)?.[1];
    const token = propResult.content[0].text.match(/Approval Token: ([^\n]+)/)?.[1];

    const result = await applyCoreUpdate({
      proposal_id: id!,
      approval_token: token!
    }, storage, memory, tempDir);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Changes reverted");

    // Verify file reverted
    const content = await readFile(join(tempDir, "src/dummy.ts"), "utf-8");
    expect(content).toBe("original content");
  });
});
