import { describe, it, expect, vi, beforeEach } from "vitest";
import { Engine, Context, Registry } from "../../src/engine.js";
import { MCP } from "../../src/mcp.js";
import { builtinSkills } from "../../src/skills.js";

// Mock LLM
class MockLLM {
  callCount = 0;

  async generate(prompt: string, history: any[], signal?: AbortSignal) {
    this.callCount++;

    // First call: Lazy refusal (User reported scenario)
    if (this.callCount === 1) {
      return {
        thought: "I should explain I can't do it.",
        tool: "none",
        args: {},
        message:
          "I did not create the file physically. I provided the content in the previous message.",
        raw: "...",
      };
    }

    // Second call: Recovery (if retry logic works)
    if (this.callCount === 2) {
      return {
        thought: "I must use the tool.",
        tool: "write_files",
        args: { files: [{ path: "test.txt", content: "hello" }] },
        message: "Creating file.",
        raw: "...",
      };
    }

    return { thought: "", tool: "none", args: {}, message: "Done" };
  }
}

describe("Engine Lazy Agent Handling", () => {
  let engine: Engine;
  let llm: MockLLM;
  let registry: Registry;
  let mcp: MCP;

  beforeEach(() => {
    llm = new MockLLM();
    registry = new Registry();
    // Register a mock write_files tool
    registry.tools.set("write_files", {
      name: "write_files",
      description: "write files",
      execute: async (args: any) => {
        return "Success";
      },
    } as any);

    mcp = new MCP();
    // Mock MCP init
    mcp.init = async () => {};
    mcp.getTools = async () => [];

    engine = new Engine(llm, registry, mcp);
    // Mock loadProjectTools to avoid FS ops
    registry.loadProjectTools = async () => {};
  });

  it("should retry when agent explicitly refuses (did not create)", async () => {
    const ctx = new Context(process.cwd(), builtinSkills.code);

    await engine.run(ctx, "Create a file named test.txt", {
      interactive: false,
    });

    expect(llm.callCount).toBeGreaterThanOrEqual(2);
  });
});
