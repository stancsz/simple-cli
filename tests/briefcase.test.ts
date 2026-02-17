import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CompanyManager } from "../src/briefcase/manager.js";
import { CompanyStore } from "../src/briefcase/store.js";
import { rm } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Mock LLM to avoid API calls
vi.mock("../src/llm.js", () => ({
  createLLM: () => ({
    embed: async (text: string) => {
        // Simple mock embedding: hash based on text length or content
        return new Array(1536).fill(0).map((_, i) => (text.length + i) % 100 / 100);
    },
    generate: async () => ({ thought: "mock", content: "mock" })
  })
}));

describe("Briefcase Core Logic", () => {
  const testCompanyA = "test-company-a-" + Date.now();
  const testCompanyB = "test-company-b-" + Date.now();

  afterEach(async () => {
    // Cleanup
    const pathA = join(process.cwd(), ".agent", "companies", testCompanyA);
    const pathB = join(process.cwd(), ".agent", "companies", testCompanyB);
    if (existsSync(pathA)) await rm(pathA, { recursive: true, force: true });
    if (existsSync(pathB)) await rm(pathB, { recursive: true, force: true });
  });

  it("should initialize store and create directories", async () => {
    const store = new CompanyStore(testCompanyA);
    await store.init();

    expect(existsSync(join(process.cwd(), ".agent", "companies", testCompanyA))).toBe(true);
    expect(existsSync(join(process.cwd(), ".agent", "companies", testCompanyA, "brain"))).toBe(true);
  });

  it("should save and load profile", async () => {
    const manager = new CompanyManager(testCompanyA);
    await manager.updateProfile({ brandVoice: "Friendly and professional" });

    const manager2 = new CompanyManager(testCompanyA);
    await manager2.load();
    const context = await manager2.getContext("");

    expect(context).toContain("Friendly and professional");
  });

  it("should isolate data between companies", async () => {
    const managerA = new CompanyManager(testCompanyA);
    const managerB = new CompanyManager(testCompanyB);

    await managerA.addDocument("docA", "Secret info for Company A");
    await managerB.addDocument("docB", "Public info for Company B");

    // Search in A
    const contextA = await managerA.getContext("Secret");
    expect(contextA).toContain("Secret info for Company A");
    expect(contextA).not.toContain("Public info for Company B");

    // Search in B
    const contextB = await managerB.getContext("Public");
    expect(contextB).toContain("Public info for Company B");
    expect(contextB).not.toContain("Secret info for Company A");
  });

  it("should list documents", async () => {
    const manager = new CompanyManager(testCompanyA);
    await manager.addDocument("doc1", "content1");
    await manager.addDocument("doc2", "content2");

    const docs = await manager.listDocuments();
    expect(docs).toContain("doc1");
    expect(docs).toContain("doc2");
    expect(docs.length).toBe(2);
  });
});
