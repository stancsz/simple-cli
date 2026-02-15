import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoGenServer } from "../../src/mcp_servers/autogen/index.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("AutoGenServer", () => {
  let server: AutoGenServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new AutoGenServer();
  });

  it("should fail if autogen python package is not installed", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = server.runConversation("test task");

    // Simulate exit code 1 (not installed) for check process
    setTimeout(() => mockProcess.emit("exit", 1), 10);

    const result = await promise;
    expect(result.content[0].text).toContain(
      "Error: Python dependency 'pyautogen' is not installed",
    );
  });

  it("should run conversation if installed", async () => {
    const mockCheckProcess = new EventEmitter() as any;
    mockCheckProcess.stdout = new EventEmitter();
    mockCheckProcess.stderr = new EventEmitter();

    const mockRunProcess = new EventEmitter() as any;
    mockRunProcess.stdout = new EventEmitter();
    mockRunProcess.stderr = new EventEmitter();

    (spawn as any)
      .mockReturnValueOnce(mockCheckProcess)
      .mockReturnValueOnce(mockRunProcess);

    const promise = server.runConversation("test task");

    // Simulate check success
    setTimeout(() => mockCheckProcess.emit("exit", 0), 10);

    // Simulate run output and success
    const mockOutput = JSON.stringify({
      result: "Final answer",
      conversation: "User: Hi\nAssistant: Hello"
    });

    setTimeout(() => {
      mockRunProcess.stdout.emit("data", mockOutput);
      mockRunProcess.emit("close", 0);
    }, 20);

    const result = await promise;
    // result.content is array of { type: 'text', text: '...' }
    // We expect two items: result and full conversation
    expect(result.content[0].text).toContain("Final answer");
    expect(result.content[1].text).toContain("User: Hi");
  });
});
