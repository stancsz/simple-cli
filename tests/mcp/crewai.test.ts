import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CrewAIServer } from "../../src/mcp_servers/crewai/index.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("CrewAIServer", () => {
  let server: CrewAIServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new CrewAIServer();
  });

  it("should fail if crewai python package is not installed", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = server.startCrew("test task");

    // Simulate exit code 1 (not installed)
    setTimeout(() => mockProcess.emit("exit", 1), 10);

    const result = await promise;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: 'crewai' python package is not installed");
  });

  it("should run crew if installed", async () => {
    const mockCheckProcess = new EventEmitter() as any;
    mockCheckProcess.stdout = new EventEmitter();
    mockCheckProcess.stderr = new EventEmitter();

    const mockRunProcess = new EventEmitter() as any;
    mockRunProcess.stdout = new EventEmitter();
    mockRunProcess.stderr = new EventEmitter();

    (spawn as any)
      .mockReturnValueOnce(mockCheckProcess)
      .mockReturnValueOnce(mockRunProcess);

    const promise = server.startCrew("test task");

    // Simulate check success
    setTimeout(() => mockCheckProcess.emit("exit", 0), 10);

    // Simulate run output and success
    setTimeout(() => {
        mockRunProcess.stdout.emit("data", "Success output");
        mockRunProcess.emit("close", 0);
    }, 20);

    const result = await promise;
    expect(result.content[0].text).toContain("Success output");
  });
});
