import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenCoworkServer } from "../../src/mcp_servers/opencowork/index.js";
import { MCP } from "../../src/mcp.js";
import { createLLM } from "../../src/llm.js";
import { Engine, Context, Registry } from "../../src/engine.js";

// Mock dependencies
vi.mock("../../src/engine.js", () => {
  return {
    Engine: vi.fn().mockImplementation(() => ({
      run: vi.fn().mockImplementation(async (ctx, prompt, options) => {
        // Simulate some history update
        ctx.history.push({ role: "assistant", content: "Done." });
      }),
    })),
    Context: vi.fn().mockImplementation((cwd, skill) => ({
      history: [],
      cwd,
      skill,
    })),
    Registry: vi.fn(),
  };
});

vi.mock("../../src/mcp.js", () => ({
  MCP: vi.fn(),
}));

vi.mock("../../src/llm.js", () => ({
  createLLM: vi.fn(),
}));

describe("OpenCoworkServer", () => {
  let server: OpenCoworkServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new OpenCoworkServer();
  });

  it("should hire a worker", async () => {
    const result = await server.hireWorker("coder", "Bob");
    expect(result.content[0].text).toContain("hired");
    expect(server.workers.has("Bob")).toBe(true);
  });

  it("should fail to hire existing worker", async () => {
    await server.hireWorker("coder", "Bob");
    await expect(server.hireWorker("coder", "Bob")).rejects.toThrow();
  });

  it("should list workers", async () => {
    await server.hireWorker("coder", "Bob");
    const result = await server.listWorkers();
    expect(result.content[0].text).toContain("Bob");
  });

  it("should delegate task", async () => {
    await server.hireWorker("coder", "Bob");
    const result = await server.delegateTask("Bob", "Write code");
    expect(result.content[0].text).toContain("Worker finished");
    expect(result.content[0].text).toContain("Done.");
  });
});
