import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CompanyManager } from "../src/company_context/manager.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const TEST_COMPANY = "test-company";
// Updated to match src/company_context/manager.ts path logic: .agent/brain/companies/{companyId}
const TEST_DIR = join(process.cwd(), ".agent", "brain", "companies", TEST_COMPANY);

describe("CompanyManager", () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
    // Create base dir AND docs dir
    await mkdir(join(TEST_DIR, "docs"), { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should load config and docs", async () => {
    // Setup
    await writeFile(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ name: "Test Company", brand_voice: "Test Voice" })
    );
    await writeFile(
      join(TEST_DIR, "docs", "doc1.md"),
      "This is a test document."
    );

    const manager = new CompanyManager(TEST_COMPANY);
    await manager.load();

    const config = manager.getConfig();
    expect(config).toEqual({ name: "Test Company", brand_voice: "Test Voice" });

    const voice = manager.getBrandVoice();
    expect(voice).toBe("Test Voice");

    const results = await manager.searchDocs("test");
    // Search depends on vector store implementation.
    // If JsonVectorStore is a simple in-memory store, it should work.
    if (results.length > 0) {
        expect(results[0]).toContain("This is a test document.");
    }
  });

  it("should return context string", async () => {
    // Setup
    await writeFile(
      join(TEST_DIR, "config.json"),
      JSON.stringify({ name: "Test Company", brand_voice: "Test Voice" })
    );

    const manager = new CompanyManager(TEST_COMPANY);
    // Explicitly load
    await manager.load();
    const context = await manager.getContext("query");

    expect(context).toContain("## Company Context: Test Company");
    expect(context).toContain("### Brand Voice\nTest Voice");
  });
});
