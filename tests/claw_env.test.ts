import { describe, it, expect, vi, beforeEach } from "vitest";
import { claw } from "../src/claw/tool.js";
import { execFile } from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn((file, args, options, cb) => {
      // Handle overload
      if (typeof options === 'function') {
          cb = options;
          options = {};
      }
      cb && cb(null, { stdout: "mock output", stderr: "" });
      return { unref: vi.fn(), kill: vi.fn() };
  }),
}));

describe("claw tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPSEEK_API_KEY = "test-key";
  });

  it("should pass DEEPSEEK_API_KEY as ANTHROPIC_API_KEY when running agent", async () => {
    await claw.execute({
      action: "agent",
      message: "hello",
    });

    // Note: execFile mock receives (file, args, options, cb) OR (file, args, cb)
    // The implementation currently doesn't pass options, so it would match [expect.any(Function)] if mocked that way.
    // But we expect it TO pass options after our fix.

    // For now, let's just inspect calls.
    const calls = (execFile as any).mock.calls;
    // console.log(calls);

    // If options is undefined, this expectation will fail (which is good)
    expect(execFile).toHaveBeenCalledWith(
      expect.stringContaining("npx"),
      expect.arrayContaining(["openclaw", "agent"]),
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_API_KEY: "test-key",
          ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
        }),
      }),
      expect.any(Function)
    );
  });
});
