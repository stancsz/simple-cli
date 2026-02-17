import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextManager } from "../../src/context/ContextManager.js";
import { MCP } from "../../src/mcp.js";

// Mock ContextServer
vi.mock("../../src/mcp_servers/context_server.js", () => {
  return {
    ContextServer: vi.fn().mockImplementation(() => ({
      readContext: vi.fn().mockResolvedValue({ goals: ["default"] }),
      updateContext: vi.fn().mockResolvedValue({ goals: ["updated"] }),
      clearContext: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe("ContextManager Brain Integration", () => {
  let mockMcp: any;
  let mockBrainClient: any;
  let contextManager: ContextManager;

  beforeEach(() => {
    mockBrainClient = {
      callTool: vi.fn(),
    };

    mockMcp = {
      getClient: vi.fn().mockReturnValue(mockBrainClient),
    };

    contextManager = new ContextManager(mockMcp as unknown as MCP);
  });

  it("loadContext should query brain and merge memories", async () => {
    // Setup brain response
    mockBrainClient.callTool.mockResolvedValueOnce({
      content: [{ type: "text", text: "Memory 1\n\n---\n\nMemory 2" }],
    });

    const context = await contextManager.loadContext("Test Task");

    expect(mockMcp.getClient).toHaveBeenCalledWith("brain");
    expect(mockBrainClient.callTool).toHaveBeenCalledWith({
      name: "brain_query",
      arguments: expect.objectContaining({
        query: "Test Task",
      }),
    });

    expect(context.goals).toEqual(["default"]); // From mocked ContextServer
    expect(context.relevant_past_experiences).toEqual(["Memory 1", "Memory 2"]);
  });

  it("loadContext should handle empty brain results", async () => {
    mockBrainClient.callTool.mockResolvedValueOnce({
      content: [{ type: "text", text: "No relevant memories found." }],
    });

    const context = await contextManager.loadContext("Test Task");

    expect(context.relevant_past_experiences).toEqual([]);
  });

  it("loadContext should handle brain errors gracefully", async () => {
    mockBrainClient.callTool.mockRejectedValueOnce(new Error("Brain dead"));

    const context = await contextManager.loadContext("Test Task");

    expect(context.relevant_past_experiences).toEqual([]);
  });

  it("saveContext should store memory to brain", async () => {
    await contextManager.saveContext("Task", "Outcome", { goals: ["new"] }, ["file.ts"]);

    expect(mockMcp.getClient).toHaveBeenCalledWith("brain");
    expect(mockBrainClient.callTool).toHaveBeenCalledWith({
      name: "brain_store",
      arguments: expect.objectContaining({
        request: "Task",
        solution: "Outcome",
        artifacts: JSON.stringify(["file.ts"]),
      }),
    });
  });
});
