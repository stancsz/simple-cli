import { describe, it, expect, vi, beforeEach } from "vitest";
import { KamalServer } from "../../src/mcp_servers/kamal/index.js";
import { EventEmitter } from "events";
import { spawn } from "child_process";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("KamalServer", () => {
  let server: KamalServer;

  beforeEach(() => {
    vi.resetAllMocks();
    server = new KamalServer();
  });

  it("should handle kamal_setup", async () => {
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = (server as any).server._registeredTools[
      "kamal_setup"
    ].handler({
      configFile: "deploy.yml",
    });

    setTimeout(() => {
      (mockProcess as any).stdout.emit("data", "Setup done");
      mockProcess.emit("close", 0);
    }, 10);

    const result = await promise;

    expect(spawn).toHaveBeenCalledWith(
      "kamal",
      ["setup", "-c", "deploy.yml"],
      expect.any(Object),
    );

    expect((result as any).content[0].text).toContain("Setup done");
  });

  it("should handle kamal_deploy", async () => {
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = (server as any).server._registeredTools[
      "kamal_deploy"
    ].handler({});

    setTimeout(() => {
      (mockProcess as any).stdout.emit("data", "Deploy done");
      mockProcess.emit("close", 0);
    }, 10);

    const result = await promise;
    expect(spawn).toHaveBeenCalledWith("kamal", ["deploy"], expect.any(Object));
  });
});
