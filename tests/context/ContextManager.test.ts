import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { ContextManager } from "../../src/context/ContextManager.js";
import { MCP } from "../../src/mcp.js";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Mock MCP for Unit Tests
const mockCallTool = vi.fn();
const mockGetClient = vi.fn(() => ({
  callTool: mockCallTool,
}));

// We only mock MCP for the unit tests suite. For integration, we'll bypass this mock.
vi.mock("../../src/mcp.js", () => {
  return {
    MCP: vi.fn(() => ({
      getClient: mockGetClient,
      init: vi.fn(),
      startServer: vi.fn(),
      discoveredServers: new Map(),
    })),
  };
});

describe("ContextManager Unit Tests", () => {
  const testDir = join(process.cwd(), ".agent-test-unit");

  beforeEach(async () => {
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(join(testDir, ".agent"), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it("should save context to local file and Brain", async () => {
    const mcp = new MCP();
    const manager = new ContextManager(mcp, undefined, testDir);
    const context = { goals: ["test goal"] };

    await manager.save(context);

    // Verify Brain call
    expect(mockGetClient).toHaveBeenCalledWith("brain");
    expect(mockCallTool).toHaveBeenCalledWith({
      name: "brain_store_context",
      arguments: {
        context: JSON.stringify(context),
        company: undefined,
      },
    });

    // Verify local file by forcing load to fail Brain and read local
    mockCallTool.mockRejectedValueOnce(new Error("Brain down"));

    const loaded = await manager.load();
    expect(loaded.goals).toEqual(["test goal"]);
  });

  it("should load context from Brain if available", async () => {
    const mcp = new MCP();
    const manager = new ContextManager(mcp, undefined, testDir);
    const remoteContext = { goals: ["remote goal"] };

    // Mock Brain response for load
    mockCallTool.mockResolvedValueOnce({
      content: [{ text: JSON.stringify(remoteContext) }],
    });

    const loaded = await manager.load();
    expect(loaded.goals).toEqual(["remote goal"]);

    // Verify it updated local cache
    // Mock Brain fail for next load to force local read
    mockCallTool.mockRejectedValueOnce(new Error("Brain down"));
    // Create new manager to avoid internal memory cache if any (ContextManager is stateless besides file)
    const manager2 = new ContextManager(mcp, undefined, testDir);
    const localLoaded = await manager2.load();
    expect(localLoaded.goals).toEqual(["remote goal"]);
  });

  it("should fallback to local file if Brain is unavailable", async () => {
    const mcp = new MCP();
    const manager = new ContextManager(mcp, undefined, testDir);
    const localContext = { goals: ["local goal"] };

    // Save to local (mock brain failure)
    mockCallTool.mockRejectedValueOnce(new Error("Brain down"));
    await manager.save(localContext);

    // Load (mock brain failure)
    mockCallTool.mockRejectedValueOnce(new Error("Brain down"));
    const loaded = await manager.load();

    expect(loaded.goals).toEqual(["local goal"]);
  });
});

// Integration tests skipped due to missing API keys in test environment for Brain Server (LLM required for embeddings).
// Logic verified via unit tests with mocks.
