import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiderServer } from "../../src/mcp_servers/aider-server.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("AiderServer", () => {
  let server: AiderServer;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, DEEPSEEK_API_KEY: "test-key" };
    server = new AiderServer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const callTool = async (name: string, args: any) => {
    const mcpServer = (server as any).server as any;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler(args);
  };

  const mockSpawnProcess = () => {
      const mockChildProcess = new EventEmitter();
      (mockChildProcess as any).stdout = new EventEmitter();
      (mockChildProcess as any).stderr = new EventEmitter();
      (mockChildProcess as any).stdin = { write: vi.fn(), end: vi.fn() };
      return mockChildProcess;
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("should handle aider_chat tool", async () => {
    const versionCheckProcess = mockSpawnProcess();
    const aiderProcess = mockSpawnProcess();

    (spawn as any)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(aiderProcess);

    const promise = callTool("aider_chat", {
      message: "Hello Aider",
      files: ["file1.ts"],
    });

    await delay(10);
    versionCheckProcess.emit("close", 0);

    await delay(10);
    // Allow for readFile async op
    await delay(10);

    (aiderProcess as any).stdout.emit("data", Buffer.from("Aider Output"));
    aiderProcess.emit("close", 0);

    const result: any = await promise;

    expect(result.content[0].text).toBe("Aider Output");
  });

  it("should handle aider_edit tool", async () => {
    const versionCheckProcess = mockSpawnProcess();
    const aiderProcess = mockSpawnProcess();

    (spawn as any)
      .mockReturnValueOnce(versionCheckProcess)
      .mockReturnValueOnce(aiderProcess);

    const promise = callTool("aider_edit", {
      task: "Edit this file",
      context_files: ["file2.ts"],
    });

    await delay(10);
    versionCheckProcess.emit("close", 0);

    await delay(10);
    await delay(10);

    (aiderProcess as any).stdout.emit("data", Buffer.from("Edit Output"));
    aiderProcess.emit("close", 0);

    const result: any = await promise;

    expect(result.content[0].text).toBe("Edit Output");
  });

  it("should handle error when DEEPSEEK_API_KEY is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const versionCheckProcess = mockSpawnProcess();
    (spawn as any).mockReturnValueOnce(versionCheckProcess);

    const promise = callTool("aider_chat", {
      message: "Hello",
    });

    await delay(10);
    versionCheckProcess.emit("close", 0);

    const result: any = await promise;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("DEEPSEEK_API_KEY environment variable is not set");
  });

  it("should handle spawn error during version check", async () => {
    const versionCheckProcess = mockSpawnProcess();
    (spawn as any).mockReturnValueOnce(versionCheckProcess);

    const promise = callTool("aider_chat", {
      message: "Hello",
    });

    await delay(10);
    versionCheckProcess.emit("error", new Error("Spawn failed"));

    const result: any = await promise;
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain("cli is not found");
  });
});
