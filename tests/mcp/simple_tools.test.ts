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

describe("SimpleToolsServer", () => {
  let server: SimpleToolsServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new SimpleToolsServer();
  });

  it("should handle read_file tool", async () => {
    (readFile as any).mockResolvedValue("File Content");

    const result = await server.handleCallTool("read_file", {
      path: "test.txt",
    });

    expect(readFile).toHaveBeenCalledWith("test.txt", "utf-8");
    expect((result as any).content[0].text).toBe("File Content");
  });

  it("should handle write_file tool", async () => {
    const result = await server.handleCallTool("write_file", {
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

    const result = await server.handleCallTool("run_command", {
      command: "echo hello",
    });

    expect(exec).toHaveBeenCalled();
    expect((result as any).content[0].text).toBe("Command Output");
  });
});
