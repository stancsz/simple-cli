import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskRunner } from "../../src/daemon/task_runner.js";
import { Context, Registry } from "../../src/engine.js";
import { MCP } from "../../src/mcp.js";

// Mock dependencies
// We don't mock the classes directly if we pass instances, but here we pass mocks.
// But we need to mock imports if TaskRunner imports them directly?
// TaskRunner imports Context, Registry, MCP only for types mostly, except usage.

describe("TaskRunner", () => {
  let runner: TaskRunner;
  let mockLLM: any;
  let mockRegistry: any;
  let mockMCP: any;
  let mockContext: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockLLM = {
      generate: vi.fn(),
    };

    mockRegistry = {
      tools: new Map(),
      loadProjectTools: vi.fn(),
    };

    mockMCP = {
      init: vi.fn(),
      getTools: vi.fn().mockResolvedValue([]),
    };

    mockContext = {
      history: [],
      cwd: "/test",
      buildPrompt: vi.fn().mockResolvedValue("mock prompt"),
    };

    runner = new TaskRunner(mockLLM, mockRegistry, mockMCP, { yoloMode: true });
  });

  it("should execute a simple task", async () => {
    // 1. Tool execution
    mockLLM.generate.mockResolvedValueOnce({
      thought: "I will write a file.",
      tool: "write_file",
      args: { path: "test.txt", content: "hello" },
      tools: [{ tool: "write_file", args: { path: "test.txt", content: "hello" } }],
    });

    // Mock Tool execution
    const mockTool = {
      name: "write_file",
      execute: vi.fn().mockResolvedValue("File written."),
    };
    mockRegistry.tools.set("write_file", mockTool);

    // 2. Supervisor verification
    mockLLM.generate.mockResolvedValueOnce({
      message: "Verified.",
    });

    // 3. Final response (Task completion)
    // After tool execution, loop continues. Input becomes "The tool executions were verified. Proceed."
    // Agent should respond with text.
    mockLLM.generate.mockResolvedValueOnce({
      message: "Task complete.",
    });

    await runner.run(mockContext, "Do something");

    expect(mockTool.execute).toHaveBeenCalledWith({ path: "test.txt", content: "hello" }, expect.any(Object));
    // History check:
    // 1. User: Do something
    // 2. Assistant: Tool call
    // 3. User: Tool result
    // 4. Supervisor prompt (inside generate call, added to history transiently? No, ctx.history is modified?)
    // In TaskRunner, ctx.history is modified.
    // 4. User: Verified
    // 5. Assistant: Task complete.

    // Wait, TaskRunner logic:
    // Loop 1: input="Do something". LLM calls tool. Tool executed. History: +ToolCall, +ToolResult.
    // Supervisor runs. If verified, input="The tool executions were verified. Proceed."
    // Loop 2: input="The tool executions...". LLM says "Task complete.". History: +TaskComplete. input=undefined.
    // Loop 3: input=undefined -> break.

    // So history length should be:
    // Initial: 0
    // Loop 1 start: +User("Do something") = 1
    // Loop 1 end: +Assistant(ToolCall) + User(ToolResult) = 3
    // Loop 2 start: +User("Verified...") = 4
    // Loop 2 end: +Assistant("Task complete") = 5

    expect(mockContext.history).toHaveLength(5);
  });

  it("should handle timeout", async () => {
    runner = new TaskRunner(mockLLM, mockRegistry, mockMCP, { yoloMode: true, timeout: 50 });

    // Simulate slow LLM
    mockLLM.generate.mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100));
        return { message: "done" };
    });

    await expect(runner.run(mockContext, "Do something")).rejects.toThrow("Task execution exceeded timeout.");
  });
});
