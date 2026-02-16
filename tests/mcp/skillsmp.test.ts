import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkillsMpServer } from "../../src/mcp_servers/skillsmp/index.js";
import { readFile, readdir, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { join } from "path";

// Mock fs/promises
vi.mock("fs/promises", async () => {
  const actual = await vi.importActual("fs/promises");
  return {
    ...actual,
    readFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
  };
});

// Mock fs
vi.mock("fs", async () => {
    const actual = await vi.importActual("fs");
    return {
        ...actual,
        existsSync: vi.fn(),
    };
});

// Mock child_process
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("SkillsMpServer", () => {
  let server: SkillsMpServer;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.resetAllMocks();
    originalEnv = process.env;
    process.env = { ...originalEnv };
    server = new SkillsMpServer();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function callTool(name: string, args: any) {
      const s = server as any;
      const tool = s.server._registeredTools[name];
      if (!tool) throw new Error(`Tool ${name} not found`);
      return tool.handler(args);
  }

  describe("skillsmp_search", () => {
    it("should return error if SKILLSMP_API_KEY is missing", async () => {
      delete process.env.SKILLSMP_API_KEY;
      const result = await callTool("skillsmp_search", { query: "test" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("SKILLSMP_API_KEY environment variable is not set");
    });

    it("should return search results if API key is present", async () => {
      process.env.SKILLSMP_API_KEY = "test-key";
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ skills: [{ name: "test-skill" }] }),
      });

      const result = await callTool("skillsmp_search", { query: "git" });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://skillsmp.com/api/v1/skills/search?q=git"),
        expect.objectContaining({
            headers: { Authorization: "Bearer test-key" }
        })
      );
      expect(result.content[0].text).toContain("test-skill");
    });

    it("should handle API errors", async () => {
      process.env.SKILLSMP_API_KEY = "test-key";
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      });

      const result = await callTool("skillsmp_search", { query: "git" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error searching skills: Unauthorized");
    });
  });

  describe("skillsmp_install", () => {
      it("should install skill from URL", async () => {
          (execFile as any).mockImplementation((file: string, args: string[], cb: any) => cb(null, { stdout: "", stderr: "" }));
          (existsSync as any).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true); // .agent/skills dir check, target dir check, SKILL.md check

          const result = await callTool("skillsmp_install", { url: "https://github.com/owner/repo.git" });

          expect(execFile).toHaveBeenCalledWith('git', ['clone', 'https://github.com/owner/repo.git', expect.stringContaining('repo')], expect.any(Function));
          expect(result.content[0].text).toContain("Successfully installed skill 'repo'");
      });

      it("should install skill from owner/repo shorthand", async () => {
        (execFile as any).mockImplementation((file: string, args: string[], cb: any) => cb(null, { stdout: "", stderr: "" }));
        (existsSync as any).mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);

        const result = await callTool("skillsmp_install", { url: "owner/repo" });

        expect(execFile).toHaveBeenCalledWith('git', ['clone', 'https://github.com/owner/repo.git', expect.stringContaining('repo')], expect.any(Function));
        expect(result.content[0].text).toContain("Successfully installed skill 'repo'");
    });

    it("should handle existing directory", async () => {
        (existsSync as any).mockReturnValue(true); // target dir exists

        const result = await callTool("skillsmp_install", { url: "owner/repo" });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("already exists");
    });

    it("should reject invalid URL", async () => {
        const result = await callTool("skillsmp_install", { url: "invalid-url" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Invalid URL");
    });

    it("should reject invalid name", async () => {
        const result = await callTool("skillsmp_install", { url: "owner/repo", name: "../malicious" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Invalid skill name");
    });
  });

  describe("skillsmp_read", () => {
      it("should read SKILL.md", async () => {
          (existsSync as any).mockReturnValue(true);
          (readFile as any).mockResolvedValue("# Test Skill\nInstructions");

          const result = await callTool("skillsmp_read", { name: "test-skill" });

          expect(readFile).toHaveBeenCalledWith(expect.stringContaining("SKILL.md"), "utf-8");
          expect(result.content[0].text).toBe("# Test Skill\nInstructions");
      });

      it("should reject invalid name", async () => {
        const result = await callTool("skillsmp_read", { name: "../shadow" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Invalid skill name");
      });

      it("should return error if SKILL.md missing", async () => {
          (existsSync as any).mockReturnValue(false);

          const result = await callTool("skillsmp_read", { name: "test-skill" });

          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain("not found");
      });
  });

  describe("skillsmp_list", () => {
      it("should list skills", async () => {
        (existsSync as any).mockReturnValue(true);
        (readdir as any).mockResolvedValue([
            { name: "skill1", isDirectory: () => true },
            { name: "skill2", isDirectory: () => true },
            { name: "file.txt", isDirectory: () => false },
        ]);

        const result = await callTool("skillsmp_list", {});

        expect(result.content[0].text).toContain("skill1");
        expect(result.content[0].text).toContain("skill2");
        expect(result.content[0].text).not.toContain("file.txt");
      });
  });
});
