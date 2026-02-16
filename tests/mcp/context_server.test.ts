import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextServer } from "../../src/mcp_servers/context/index.js";
import { ContextManager } from "../../src/context_manager.js";

// Mock ContextManager
const mockAddGoal = vi.fn();
const mockAddConstraint = vi.fn();
const mockLogChange = vi.fn();
const mockGetContextSummary = vi.fn();
const mockSearchMemory = vi.fn();
const mockAddMemory = vi.fn();

vi.mock("../../src/context_manager.js", () => {
  return {
    ContextManager: class {
      addGoal = mockAddGoal;
      addConstraint = mockAddConstraint;
      logChange = mockLogChange;
      getContextSummary = mockGetContextSummary;
      searchMemory = mockSearchMemory;
      addMemory = mockAddMemory;
    },
  };
});

describe("ContextServer", () => {
  let server: ContextServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new ContextServer();
  });

  it("should handle update_context tool", async () => {
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["update_context"];
    expect(tool).toBeDefined();

    const result = await tool.handler({
      goal: "New Goal",
      constraint: "New Constraint",
    });

    expect(mockAddGoal).toHaveBeenCalledWith("New Goal");
    expect(mockAddConstraint).toHaveBeenCalledWith("New Constraint");
    expect(result.content[0].text).toContain("Added goal: New Goal");
    expect(result.content[0].text).toContain("Added constraint: New Constraint");
  });

  it("should handle read_context tool", async () => {
    mockGetContextSummary.mockResolvedValue("Context Summary");

    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["read_context"];
    expect(tool).toBeDefined();

    const result = await tool.handler({});

    expect(mockGetContextSummary).toHaveBeenCalled();
    expect(result.content[0].text).toBe("Context Summary");
  });

  it("should handle search_memory tool", async () => {
    mockSearchMemory.mockResolvedValue("Memory Result");

    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["search_memory"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ query: "test" });

    expect(mockSearchMemory).toHaveBeenCalledWith("test", 5);
    expect(result.content[0].text).toBe("Memory Result");
  });

  it("should handle add_memory tool", async () => {
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["add_memory"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ text: "Important Info", metadata: '{"tag":"test"}' });

    expect(mockAddMemory).toHaveBeenCalledWith("Important Info", { tag: "test" });
    expect(result.content[0].text).toBe("Memory added.");
  });
});
