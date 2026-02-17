import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextManager } from "../src/context/manager.js";
import { delegate_cli } from "../src/builtins.js";
import { MCP } from "../src/mcp.js";
import { EventEmitter } from "events";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(() => true), // default to true
}));

describe("UCP Integration", () => {
  let mockMcp: any;
  let mockClient: any;
  let contextManager: ContextManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      callTool: vi.fn(),
    };

    mockMcp = {
      getClient: vi.fn((name) => (name === "brain" ? mockClient : undefined)),
    } as unknown as MCP;

    contextManager = new ContextManager(mockMcp);
  });

  describe("ContextManager", () => {
    it("should retrieve context from brain", async () => {
      mockClient.callTool.mockResolvedValue({
        content: [{ text: JSON.stringify({ goals: ["win"] }) }],
      });

      const context = await contextManager.readContext();
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: "brain_retrieve_context",
        arguments: { company: process.env.JULES_COMPANY },
      });
      expect(context.goals).toEqual(["win"]);
    });

    it("should store context to brain on update", async () => {
      // Mock retrieve first (needed for update)
      mockClient.callTool.mockResolvedValueOnce({
        content: [{ text: JSON.stringify({ goals: ["win"] }) }],
      });

      // Mock store
      mockClient.callTool.mockResolvedValueOnce({
        content: [{ text: "Context stored successfully." }],
      });

      await contextManager.updateContext({ constraints: ["no bugs"] });

      expect(mockClient.callTool).toHaveBeenLastCalledWith({
        name: "brain_store_context",
        arguments: expect.objectContaining({
          context: expect.stringContaining('"goals":["win"]'),
        }),
      });

      // Verify merged context
      const lastCall = mockClient.callTool.mock.calls[1][0];
      const storedContext = JSON.parse(lastCall.arguments.context);
      expect(storedContext.constraints).toEqual(["no bugs"]);
    });
  });

  describe("delegate_cli", () => {
    it("should inject context via stdin for stdin-supporting agents", async () => {
      // Mock context read
      vi.spyOn(contextManager, "readContext").mockResolvedValue({
        goals: ["test goal"],
        constraints: [],
        recent_changes: [],
        active_tasks: [],
      });

      const { spawn } = await import("child_process");
      const mockChild = new EventEmitter() as any;
      mockChild.stdin = { write: vi.fn(), end: vi.fn() };
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      (spawn as any).mockReturnValue(mockChild);

      setTimeout(() => mockChild.emit("close", 0), 10);

      const result = await delegate_cli("aider", ["--message", "fix it"], contextManager);

      expect(spawn).toHaveBeenCalledWith(
        "aider",
        ["--message", "fix it"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] })
      );

      expect(mockChild.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('# Context:\n{\n  "goals": [\n    "test goal"')
      );
    });

    it("should inject context via file for other agents", async () => {
      // Mock context read
      vi.spyOn(contextManager, "readContext").mockResolvedValue({
        goals: ["test goal"],
        constraints: [],
        recent_changes: [],
        active_tasks: [],
      });

      const { spawn } = await import("child_process");
      const { writeFile } = await import("fs/promises");

      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      (spawn as any).mockReturnValue(mockChild);

      setTimeout(() => mockChild.emit("close", 0), 10);

      await delegate_cli("custom-tool", ["arg1"], contextManager);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("temp_context.md"),
        expect.stringContaining('# Context:\n{\n  "goals": [\n    "test goal"')
      );

      expect(spawn).toHaveBeenCalledWith(
        "custom-tool",
        expect.arrayContaining(["arg1", "--context-file", expect.stringContaining("temp_context.md")]),
        expect.anything()
      );
    });
  });
});
