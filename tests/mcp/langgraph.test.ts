import { describe, it, expect, vi, beforeEach } from "vitest";
import { LangGraphServer } from "../../src/mcp_servers/langgraph/index.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("LangGraphServer", () => {
  let server: LangGraphServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new LangGraphServer();
  });

  it("should fail if langgraph python package is not installed", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = server.runAgent("test task");

    // Simulate exit code 1 (not installed) for the check process
    setTimeout(() => mockProcess.emit("exit", 1), 10);

    const result = await promise;
    expect(result.content[0].text).toContain(
      "Error: Python dependencies 'langgraph' or 'langchain_openai' are not installed",
    );
  });

  it("should run agent if installed", async () => {
    const mockCheckProcess = new EventEmitter() as any;
    mockCheckProcess.stdout = new EventEmitter();
    mockCheckProcess.stderr = new EventEmitter();

    const mockRunProcess = new EventEmitter() as any;
    mockRunProcess.stdout = new EventEmitter();
    mockRunProcess.stderr = new EventEmitter();

    (spawn as any)
      .mockReturnValueOnce(mockCheckProcess)
      .mockReturnValueOnce(mockRunProcess);

    const promise = server.runAgent("test task");

    // Simulate check success
    setTimeout(() => mockCheckProcess.emit("exit", 0), 10);

    // Simulate run output and success
    setTimeout(() => {
      mockRunProcess.stdout.emit("data", JSON.stringify({ result: "Agent output" }));
      mockRunProcess.emit("close", 0);
    }, 20);

    const result = await promise;
    // The implementation tries to parse JSON, if successful, returns result field.
    // If our mock output is valid JSON, it should be processed.
    // Wait, the implementation does:
    // const jsonOutput = JSON.parse(output.trim());
    // resolve({ content: [{ type: "text", text: jsonOutput.result }] });
    // So we expect "Agent output"

    // Actually, check my implementation of index.ts again.
    // It returns resolve({ content: [{ type: "text", text: jsonOutput.result }] });
    // So the text should be "Agent output".
    expect(result.content[0].text).toBe("Agent output");
  });
});
