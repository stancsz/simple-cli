import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextServer } from "../../src/mcp_servers/context_server.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

// Mock dependencies
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

vi.mock("fs", () => ({
  existsSync: vi.fn()
}));

vi.mock("proper-lockfile", () => ({
  lock: vi.fn().mockResolvedValue(() => Promise.resolve())
}));

describe("ContextServer", () => {
  let server: ContextServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new ContextServer();
  });

  it("should read context", async () => {
    const mockData = {
      goals: ["Test Goal"],
      constraints: [],
      recent_changes: []
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockData));

    const result = await server.readContext();
    expect(result.goals).toContain("Test Goal");
  });

  it("should update context with deep merge", async () => {
    const initialData = {
      goals: ["Goal 1"],
      constraints: ["Constraint 1"],
      recent_changes: []
    };
    const updates = {
      goals: ["Goal 2"],
      working_memory: "Updated memory"
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(initialData));
    vi.mocked(writeFile).mockResolvedValue(undefined as any);

    const result = await server.updateContext(updates);

    expect(result.goals).toEqual(["Goal 2"]);
    expect(result.working_memory).toBe("Updated memory");
    expect(result.constraints).toEqual(["Constraint 1"]);
    expect(writeFile).toHaveBeenCalled();
  });

  it("should clear context", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined as any);
    await server.clearContext();
    expect(writeFile).toHaveBeenCalled();
    const callArgs = vi.mocked(writeFile).mock.calls[0];
    const writtenData = JSON.parse(callArgs[1] as string);
    expect(writtenData.goals).toEqual([]);
  });
});
