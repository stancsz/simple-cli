import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextServer } from "../../src/mcp_servers/context_manager/index.js";

// Mock dependencies
const mockSearch = vi.fn();
const mockAdd = vi.fn();
const mockClose = vi.fn();

vi.mock("../../src/memory/vector_store.js", () => {
  return {
    VectorStore: class {
      constructor() {}
      search = mockSearch;
      add = mockAdd;
      close = mockClose;
    }
  };
});

vi.mock("fs/promises", async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        writeFile: vi.fn(),
        readFile: vi.fn().mockResolvedValue(JSON.stringify({
            goals: [],
            constraints: [],
            recent_changes: []
        })),
        mkdir: vi.fn(),
        unlink: vi.fn(),
        stat: vi.fn().mockResolvedValue({ mtimeMs: Date.now() })
    };
});

vi.mock("fs", async () => {
    return {
        existsSync: vi.fn().mockReturnValue(true)
    };
});

describe("ContextServer", () => {
  let server: ContextServer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset ContextManager state by mocking readFile return?
    // ContextManager loads on every call.
    server = new ContextServer();
  });

  it("should handle update_context tool", async () => {
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["update_context"];
    expect(tool).toBeDefined();

    // Mock FS state
    let fsState = {
        goals: [],
        constraints: [],
        recent_changes: []
    };
    const fs = await import("fs/promises");

    vi.mocked(fs.readFile).mockImplementation(async (path) => {
        if (path.toString().endsWith("context.json")) {
            return JSON.stringify(fsState);
        }
        return "";
    });

    vi.mocked(fs.writeFile).mockImplementation(async (path, content) => {
        if (path.toString().endsWith("context.json")) {
            fsState = JSON.parse(content as string);
        }
        return undefined;
    });

    const result = await tool.handler({
      goal: "New Goal",
      constraint: "New Constraint",
    });

    // Check final state
    expect(fsState.goals).toContain("New Goal");
    expect(fsState.constraints).toContain("New Constraint");

    expect(result.content[0].text).toContain("Added goal: New Goal");
  });

  it("should handle read_context tool", async () => {
    const fs = await import("fs/promises");
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        goals: ["Goal 1"],
        constraints: ["Constraint 1"],
        recent_changes: ["Change 1"]
    }));

    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["read_context"];
    expect(tool).toBeDefined();

    const result = await tool.handler({});

    expect(result.content[0].text).toContain("Goal 1");
    expect(result.content[0].text).toContain("Constraint 1");
  });

  it("should handle search_memory tool", async () => {
    mockSearch.mockResolvedValue([{ text: "Memory Result", distance: 0.1 }]);

    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["search_memory"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ query: "test" });

    expect(mockSearch).toHaveBeenCalledWith("test", 5);
    expect(result.content[0].text).toContain("Memory Result");
  });

  it("should handle add_memory tool", async () => {
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["add_memory"];
    expect(tool).toBeDefined();

    const result = await tool.handler({ text: "Important Info", metadata: '{"tag":"test"}' });

    expect(mockAdd).toHaveBeenCalledWith("Important Info", { tag: "test" });
    expect(result.content[0].text).toBe("Memory added.");
  });

  it("should handle inject_context tool", async () => {
    const fs = await import("fs/promises");
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        goals: ["Goal 1"],
        constraints: [],
        recent_changes: []
    }));

    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools["inject_context"];
    expect(tool).toBeDefined();

    // Test return method
    const resultReturn = await tool.handler({ method: "return" });
    expect(resultReturn.content[0].text).toContain("Goal 1");

    // Test file method
    const resultFile = await tool.handler({ method: "file", path: "test_context.md" });
    expect(fs.writeFile).toHaveBeenCalledWith("test_context.md", expect.stringContaining("Goal 1"));
    expect(resultFile.content[0].text).toContain("Context injected into file: test_context.md");
  });
});
