import { describe, it, expect, vi, beforeEach } from "vitest";
import * as child_process from "child_process";
import { pr_create } from "../src/builtins.js";

// Mock child_process
vi.mock("child_process", () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn((file, args, cb) => {
    // cb(error, stdout, stderr)
    // Simulate successful execution
    if (typeof args === "function") {
      cb = args;
      args = [];
    }
    cb(
      null,
      { stdout: "https://github.com/owner/repo/pull/1", stderr: "" },
      "",
    );
  }),
}));

describe("pr_create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default implementation
    (child_process.execFile as any).mockImplementation(
      (file: string, args: any, cb: any) => {
        if (typeof args === "function") {
          cb = args;
          args = [];
        }
        cb(
          null,
          { stdout: "https://github.com/owner/repo/pull/1", stderr: "" },
          "",
        );
      },
    );
  });

  it("should call gh pr create with correct arguments", async () => {
    const result = await pr_create.execute({
      title: "My PR",
      body: "My body",
      draft: false,
    });

    expect(child_process.execFile).toHaveBeenCalledWith(
      "gh",
      ["pr", "create", "--title", "My PR", "--body", "My body"],
      expect.any(Function),
    );
    expect(result).toBe("https://github.com/owner/repo/pull/1");
  });

  it("should include draft flag if true", async () => {
    await pr_create.execute({
      title: "Draft PR",
      body: "Draft body",
      draft: true,
    });

    expect(child_process.execFile).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--draft"]),
      expect.any(Function),
    );
  });

  it("should include base and head if provided", async () => {
    await pr_create.execute({
      title: "PR",
      body: "Body",
      draft: false,
      base: "main",
      head: "feature",
    });

    expect(child_process.execFile).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--base", "main", "--head", "feature"]),
      expect.any(Function),
    );
  });

  it("should handle errors", async () => {
    (child_process.execFile as any).mockImplementation(
      (file: string, args: string[], cb: Function) => {
        cb(new Error("Failed to create PR"));
      },
    );

    const result = await pr_create.execute({
      title: "Error PR",
      body: "Error",
      draft: false,
    });

    expect(result).toContain("Error creating PR: Failed to create PR");
  });
});
