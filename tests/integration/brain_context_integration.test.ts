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

  describe("loadContext", () => {
    it("should query brain and merge memories", async () => {
      // Setup brain response
      mockBrainClient.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "Memory 1\n\n---\n\nMemory 2" }],
      });

      const context = await contextManager.loadContext("Test Task", "companyA");

      expect(mockMcp.getClient).toHaveBeenCalledWith("brain");
      expect(mockBrainClient.callTool).toHaveBeenCalledWith({
        name: "brain_query",
        arguments: expect.objectContaining({
          query: "Test Task",
          company: "companyA"
        }),
      });

      expect(context.goals).toEqual(["default"]); // From mocked ContextServer
      expect(context.relevant_past_experiences).toEqual(["Memory 1", "Memory 2"]);
    });

    it("should handle empty brain results", async () => {
      mockBrainClient.callTool.mockResolvedValueOnce({
        content: [{ type: "text", text: "No relevant memories found." }],
      });

      const context = await contextManager.loadContext("Test Task");
      expect(context.relevant_past_experiences).toEqual([]);
    });

    it("should handle brain errors gracefully", async () => {
      mockBrainClient.callTool.mockRejectedValueOnce(new Error("Brain dead"));

      const context = await contextManager.loadContext("Test Task");
      expect(context.relevant_past_experiences).toEqual([]);
    });
  });

  describe("saveContext", () => {
    it("should store memory to brain and link artifacts", async () => {
      // Mock successful tool calls
      mockBrainClient.callTool.mockResolvedValue({
        content: [{ type: "text", text: "Success" }],
      });

      const taskDesc = "Refactor login";
      const outcome = "Success";
      const artifacts = ["src/auth.ts", "src/user.ts"];
      const company = "companyB";

      await contextManager.saveContext(taskDesc, outcome, { goals: ["secure"] }, artifacts, company);

      expect(mockMcp.getClient).toHaveBeenCalledWith("brain");

      // Verify brain_store call
      expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
        name: "brain_store",
        arguments: expect.objectContaining({
          request: taskDesc,
          solution: outcome,
          artifacts: JSON.stringify(artifacts),
          company: company
        }),
      }));

      // Verify brain_update_graph calls for Task Node
      expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
        name: "brain_update_graph",
        arguments: expect.objectContaining({
          operation: "add_node",
          company: company,
          args: expect.stringContaining('"type":"task"'),
        }),
      }));

      // Verify brain_update_graph calls for Artifact Nodes (File)
      expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
        name: "brain_update_graph",
        arguments: expect.objectContaining({
            operation: "add_node",
            company: company,
            args: expect.stringContaining('"type":"file"'),
        }),
      }));

      // Verify brain_update_graph calls for Edges
      expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
        name: "brain_update_graph",
        arguments: expect.objectContaining({
            operation: "add_edge",
            company: company,
            args: expect.stringContaining('"relation":"modifies"'),
        }),
      }));
    });

    it("should handle brain errors during save without failing updateContext", async () => {
      // UpdateContext mock should succeed (mocked at top level)
      mockBrainClient.callTool.mockRejectedValue(new Error("Brain unavailable"));

      await expect(contextManager.saveContext("Task", "Outcome", {}, [])).resolves.not.toThrow();
    });
  });

  describe("Concurrency & Multi-tenancy", () => {
      it("should handle concurrent context loads for different companies", async () => {
          mockBrainClient.callTool
              .mockResolvedValueOnce({ content: [{ type: "text", text: "Mem A" }] })
              .mockResolvedValueOnce({ content: [{ type: "text", text: "Mem B" }] });

          const [ctxA, ctxB] = await Promise.all([
              contextManager.loadContext("Task A", "CompanyA"),
              contextManager.loadContext("Task B", "CompanyB")
          ]);

          expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
              name: "brain_query",
              arguments: expect.objectContaining({ company: "CompanyA" })
          }));

          expect(mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
              name: "brain_query",
              arguments: expect.objectContaining({ company: "CompanyB" })
          }));

          expect(ctxA.relevant_past_experiences).toContain("Mem A");
          expect(ctxB.relevant_past_experiences).toContain("Mem B");
      });
  });
});
