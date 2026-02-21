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

  it("saveContext should store memory and link artifacts", async () => {
    const taskDesc = "Fix bug in X";
    const outcome = "Fixed it";
    const artifacts = ["src/file1.ts", "src/file2.ts"];

    await contextManager.saveContext(taskDesc, outcome, {}, artifacts);

    expect(mockMcp.getClient).toHaveBeenCalledWith("brain");

    // 1. Verify episodic memory storage
    expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: "brain_store",
      arguments: expect.objectContaining({
        request: taskDesc,
        solution: outcome,
        artifacts: JSON.stringify(artifacts),
      }),
    }));

    // 2. Verify semantic graph updates (Task Node)
    expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: "brain_update_graph",
      arguments: expect.objectContaining({
        operation: "add_node",
        args: expect.stringContaining('"type":"task"'),
      }),
    }));

    // 3. Verify semantic graph updates (Artifact Nodes and Edges)
    // We expect 2 artifacts => 2 add_node (file) + 2 add_edge calls
    for (const artifact of artifacts) {
        // Check for file node creation
        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_update_graph",
            arguments: expect.objectContaining({
                operation: "add_node",
                args: expect.stringContaining(`"id":"${artifact}"`),
            }),
        }));

        // Check for edge creation
        expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: "brain_update_graph",
            arguments: expect.objectContaining({
                operation: "add_edge",
                args: expect.stringContaining(`"to":"${artifact}"`),
            }),
        }));
    }
  });

  it("saveContext should handle graph update failures gracefully", async () => {
      // Mock brain_store success
      mockBrainClient.callTool.mockImplementation((args: any) => {
          if (args.name === "brain_store") return Promise.resolve({});
          if (args.name === "brain_update_graph") return Promise.reject(new Error("Graph down"));
          return Promise.resolve({});
      });

      const artifacts = ["src/file1.ts"];
      await contextManager.saveContext("Task", "Outcome", {}, artifacts);

      // Should not throw
      expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "brain_store" }));
  });
});
