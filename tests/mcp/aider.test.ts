import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiderServer } from "../../src/mcp_servers/aider/index.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs/promises";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("AiderServer", () => {
  let server: AiderServer;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks(); // Wipes implementations

    // Setup readFile mock
    (fs.readFile as any).mockResolvedValue("MOCK_SOUL");

    process.env = { ...originalEnv, DEEPSEEK_API_KEY: "test-key" };
    server = new AiderServer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const callTool = async (name: string, args: any) => {
    const mcpServer = (server as any).server as any;
    const registeredTools = (mcpServer as any)._registeredTools;
    const tool = registeredTools ? registeredTools[name] : undefined;

    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  it("should handle aider_chat tool", async () => {
    const mockChildProcess = new EventEmitter();
    (mockChildProcess as any).stdout = new EventEmitter();
    (mockChildProcess as any).stderr = new EventEmitter();

    (spawn as any).mockReturnValue(mockChildProcess);

    const promise = callTool("aider_chat", {
      message: "Hello Aider",
      files: ["file1.ts"],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    (mockChildProcess as any).stdout.emit("data", Buffer.from("Aider Output"));
    mockChildProcess.emit("close", 0);

    const result = await promise;

    expect(spawn).toHaveBeenCalledWith(
      "aider",
      [
        "--model", "deepseek/deepseek-chat",
        "--api-key", "deepseek=test-key",
        "--yes",
        "--message", "MOCK_SOUL\n\nTask:\nHello Aider",
        "file1.ts"
      ],
      expect.objectContaining({
        env: expect.objectContaining({ DEEPSEEK_API_KEY: "test-key" }),
        shell: false
      })
    );
    expect((result as any).content[0].text).toBe("Aider Output");
  });

  it("should handle aider_edit_files tool", async () => {
    const mockChildProcess = new EventEmitter();
    (mockChildProcess as any).stdout = new EventEmitter();
    (mockChildProcess as any).stderr = new EventEmitter();

    (spawn as any).mockReturnValue(mockChildProcess);

    const promise = callTool("aider_edit_files", {
      message: "Edit this file",
      files: ["file2.ts"],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    (mockChildProcess as any).stdout.emit("data", Buffer.from("Edit Output"));
    mockChildProcess.emit("close", 0);

    const result = await promise;

    expect(spawn).toHaveBeenCalledWith(
      "aider",
      [
        "--model", "deepseek/deepseek-chat",
        "--api-key", "deepseek=test-key",
        "--yes",
        "--message", "MOCK_SOUL\n\nTask:\nEdit this file",
        "file2.ts"
      ],
      expect.objectContaining({
        env: expect.objectContaining({ DEEPSEEK_API_KEY: "test-key" }),
        shell: false
      })
    );
    expect((result as any).content[0].text).toBe("Edit Output");
  });

  it("should handle error when DEEPSEEK_API_KEY is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const result = await callTool("aider_chat", {
      message: "Hello",
    });

    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("DEEPSEEK_API_KEY environment variable is not set");
  });

  it("should handle spawn error", async () => {
    const mockChildProcess = new EventEmitter();
    (mockChildProcess as any).stdout = new EventEmitter();
    (mockChildProcess as any).stderr = new EventEmitter();

    (spawn as any).mockReturnValue(mockChildProcess);

    const promise = callTool("aider_chat", {
      message: "Hello",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    mockChildProcess.emit("error", new Error("Spawn failed"));

    const result = await promise;
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("Failed to start aider");
  });

  it("should handle non-zero exit code", async () => {
    const mockChildProcess = new EventEmitter();
    (mockChildProcess as any).stdout = new EventEmitter();
    (mockChildProcess as any).stderr = new EventEmitter();

    (spawn as any).mockReturnValue(mockChildProcess);

    const promise = callTool("aider_chat", {
      message: "Hello",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    (mockChildProcess as any).stderr.emit("data", Buffer.from("Some error"));
    mockChildProcess.emit("close", 1);

    const result = await promise;
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("Aider failed with exit code 1");
  });
});
