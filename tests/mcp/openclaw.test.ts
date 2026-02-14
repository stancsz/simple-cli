import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenClawServer } from "../../src/mcp_servers/openclaw/index.js";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  join: vi.fn(),
  readFileSync: vi.fn(),
}));

describe("OpenClawServer", () => {
  let server: OpenClawServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new OpenClawServer();
  });

  it("should attempt to run skill", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = server.runSkill("weather", { location: "London" });

    // Simulate output
    setTimeout(() => {
      mockProcess.stdout.emit("data", "Weather in London is sunny");
      mockProcess.emit("close", 0);
    }, 10);

    const result = await promise;
    expect(result.content[0].text).toContain("Weather in London is sunny");
    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining("openclaw"),
      expect.arrayContaining(["run", "weather", "--location", "London"]),
      expect.any(Object),
    );
  });

  it("should fail gracefully if CLI not found", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    (spawn as any).mockReturnValue(mockProcess);

    const promise = server.runSkill("unknown", {});

    setTimeout(() => {
      mockProcess.stderr.emit("data", "command not found: openclaw");
      mockProcess.emit("close", 127);
    }, 10);

    const result = await promise;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("OpenClaw CLI not found");
  });
});
