import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JulesServer } from "../../src/mcp_servers/jules/index.js";
import { exec } from "child_process";
import fetch from "node-fetch";

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node-fetch", () => ({
  default: vi.fn(),
}));

describe("JulesServer", () => {
  let server: JulesServer;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.JULES_API_KEY = "test-key";
    server = new JulesServer();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.JULES_API_KEY = "test-key";
  });

  it("should fail if JULES_API_KEY is missing", async () => {
    delete process.env.JULES_API_KEY;
    server = new JulesServer();

    const result = await (server as any).client.executeTask("test task");
    expect(result.success).toBe(false);
    expect(result.message).toContain("JULES_API_KEY not set");
  });

  it("should execute task successfully", async () => {
    // Mock git commands
    (exec as any).mockImplementation((cmd: string, cb: any) => {
        if (typeof cb !== 'function') cb = arguments[arguments.length - 1];
        if (cmd.includes("remote get-url")) cb(null, { stdout: "https://github.com/owner/repo.git", stderr: "" });
        else if (cmd.includes("rev-parse")) cb(null, { stdout: "main", stderr: "" });
        else cb(new Error("Unknown command"));
    });

    // Mock fetch responses
    const mockFetch = fetch as any;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sources: [{ name: "source/1", githubRepo: { owner: "owner", repo: "repo" } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "sessions/123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
            outputs: [{ pullRequest: { url: "http://pr.url" } }]
        }),
      });

    const result = await (server as any).client.executeTask("test task");

    expect(result.success).toBe(true);
    expect(result.prUrl).toBe("http://pr.url");
  });

  it("should handle source not found", async () => {
     (exec as any).mockImplementation((cmd: string, cb: any) => {
         if (typeof cb !== 'function') cb = arguments[arguments.length - 1];
        if (cmd.includes("remote get-url")) cb(null, { stdout: "https://github.com/owner/repo.git", stderr: "" });
        else if (cmd.includes("rev-parse")) cb(null, { stdout: "main", stderr: "" });
        else cb(new Error("Unknown command"));
    });

    (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sources: [] }),
    });

    const result = await (server as any).client.executeTask("test task");

    expect(result.success).toBe(false);
    expect(result.message).toContain("not found in your Jules sources");
  });
});
