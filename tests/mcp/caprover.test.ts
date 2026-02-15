import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaproverServer } from "../../src/mcp_servers/caprover/index.js";
import { EventEmitter } from "events";
import { spawn } from "child_process";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("CaproverServer", () => {
  let server: CaproverServer;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CAPROVER_URL = "http://caprover.test";
    process.env.CAPROVER_PASSWORD = "pass";
    server = new CaproverServer();
  });

  it("should handle caprover_deploy", async () => {
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    // Access private property to test tool handler directly
    const tool = (server as any).server._registeredTools["caprover_deploy"];
    const promise = tool.handler({
      appName: "test-app",
    });

    // Simulate process output
    setTimeout(() => {
      (mockProcess as any).stdout.emit("data", "Deploy success");
      mockProcess.emit("close", 0);
    }, 10);

    const result = await promise;

    expect(spawn).toHaveBeenCalledWith(
      "npx",
      [
        "--yes",
        "caprover",
        "deploy",
        "-a",
        "test-app",
        "-d",
        "--caproverUrl",
        "http://caprover.test",
        "--caproverPassword",
        "pass",
      ],
      expect.any(Object),
    );

    expect((result as any).content[0].text).toContain("Deploy success");
  });
});
