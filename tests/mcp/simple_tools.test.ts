import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimpleToolsServer } from "../../src/mcp_servers/simple_tools/index.js";
import { readFile, writeFile } from "fs/promises";
import { exec } from "child_process";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

// Mock ContextManager
const mockAddGoal = vi.fn();
const mockAddConstraint = vi.fn();
const mockLogChange = vi.fn();
const mockGetContextSummary = vi.fn();

vi.mock("../../src/context_manager.js", () => {
  return {
    ContextManager: class {
      addGoal = mockAddGoal;
      addConstraint = mockAddConstraint;
      logChange = mockLogChange;
      getContextSummary = mockGetContextSummary;
    },
  };
});

describe("SimpleToolsServer", () => {
  let server: SimpleToolsServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new SimpleToolsServer();
  });

  // Helper to access tool handler
  const callTool = async (name: string, args: any) => {
    const mcpServer = (server as any).server; // Access private property
    const tool = (mcpServer as any)._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.handler(args);
  };

  it("should handle update_context tool", async () => {
    const result = await callTool("update_context", {
      goal: "New Goal",
      constraint: "New Constraint",
    });

    expect(mockAddGoal).toHaveBeenCalledWith("New Goal");
    expect(mockAddConstraint).toHaveBeenCalledWith("New Constraint");
    expect((result as any).content[0].text).toContain("Added goal: New Goal");
    expect((result as any).content[0].text).toContain(
      "Added constraint: New Constraint",
    );
  });

  it("should handle read_context tool", async () => {
    mockGetContextSummary.mockResolvedValue("Context Summary");

    const result = await callTool("read_context", {});

    expect(mockGetContextSummary).toHaveBeenCalled();
    expect((result as any).content[0].text).toBe("Context Summary");
  });

  it("should handle read_file tool", async () => {
    (readFile as any).mockResolvedValue("File Content");

    const result = await callTool("read_file", {
      path: "test.txt",
    });

    expect(readFile).toHaveBeenCalledWith("test.txt", "utf-8");
    expect((result as any).content[0].text).toBe("File Content");
  });

  it("should handle write_file tool", async () => {
    const result = await callTool("write_file", {
      path: "test.txt",
      content: "Content",
    });

    expect(writeFile).toHaveBeenCalledWith("test.txt", "Content");
    expect((result as any).content[0].text).toContain(
      "Successfully wrote to test.txt",
    );
  });

  it("should handle run_command tool", async () => {
    (exec as any).mockImplementation((cmd: string, cb: any) => {
      cb(null, { stdout: "Command Output", stderr: "" });
    });

    const result = await callTool("run_command", {
      command: "echo hello",
    });

    expect(exec).toHaveBeenCalled();
    expect((result as any).content[0].text).toBe("Command Output");
  });
});
