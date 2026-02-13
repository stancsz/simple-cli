import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readFiles,
  writeFiles,
  deleteFile,
  listFiles,
  listDir,
  searchFiles,
  change_dir,
} from "../src/builtins.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";

describe("Path Traversal Security (Disabled)", () => {
  let tempDir: string;
  let outsideFile: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    const p = join(tmpdir(), `test-security-${Date.now()}`);
    await mkdir(p, { recursive: true });
    tempDir = p;
    outsideFile = join(tempDir, "secret.txt");
    await writeFile(outsideFile, "SECRET_DATA");
  });

  afterEach(async () => {
    // Reset cwd first to ensure we are not in the dir we are about to delete
    try {
      process.chdir(originalCwd);
    } catch (e) {}
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("readFiles should allow access to outside files", async () => {
    const result = await readFiles.execute({ paths: [outsideFile] });
    const fileRes = result.find((r: any) => r.path === outsideFile);
    expect(fileRes).toBeDefined();
    // Should contain content now
    expect(fileRes.content).toBe("SECRET_DATA");
  });

  it("writeFiles should allow writing to outside files", async () => {
    const target = join(tempDir, "hacked.txt");
    const result = await writeFiles.execute({
      files: [{ path: target, content: "hacked" }],
    });
    const res = Array.isArray(result) ? result[0] : result;
    expect(res.success).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it("deleteFile should allow deleting outside files", async () => {
    const result = await deleteFile.execute({ path: outsideFile });
    expect(result).toContain("Deleted");
    expect(existsSync(outsideFile)).toBe(false);
  });

  it("listFiles should allow listing outside directories", async () => {
    const result = await listFiles.execute({
      pattern: "*",
      path: tempDir,
      ignore: [],
      includeDirectories: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("listDir should allow listing outside directories", async () => {
    const result = await listDir.execute({ path: tempDir });
    expect(Array.isArray(result)).toBe(true);
  });

  it("searchFiles should allow searching in outside files", async () => {
    const result = await searchFiles.execute({
      pattern: "SECRET",
      path: outsideFile,
      glob: "*",
      ignoreCase: false,
      contextLines: 0,
      filesOnly: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("change_dir should change process.cwd()", async () => {
    const original = process.cwd();
    await change_dir.execute({ path: tempDir });
    expect(process.cwd()).toContain(tempDir); // In macOS/tmp implies /private/tmp so contain is safer

    // Change back
    await change_dir.execute({ path: original });
  });
});
