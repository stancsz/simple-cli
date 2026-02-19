import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CompanyContextServer } from "../src/mcp_servers/company_context/index.js";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";

// Mock LLM
vi.mock("../src/llm.js", () => {
  return {
    createLLM: () => ({
      embed: vi.fn().mockImplementation(async (text: string) => {
        // Deterministic mock embedding
        // If text contains "alpha", return vector pointing one way
        // If "beta", return vector pointing another way
        const val = text.includes("alpha") ? 0.1 : 0.9;
        return new Array(1536).fill(val);
      }),
    }),
  };
});

describe("CompanyContextServer", () => {
  const testRoot = join(process.cwd(), ".agent-test-company");
  const companyA = "company-alpha";
  const companyB = "company-beta";

  beforeEach(async () => {
    // Override process.cwd to use a test directory
    vi.spyOn(process, "cwd").mockReturnValue(testRoot);

    // Clean start
    await rm(testRoot, { recursive: true, force: true });

    // Setup directories
    await mkdir(join(testRoot, ".agent", "companies", companyA, "docs"), { recursive: true });
    await mkdir(join(testRoot, ".agent", "companies", companyB, "docs"), { recursive: true });

    // Create docs
    await writeFile(join(testRoot, ".agent", "companies", companyA, "docs", "doc-a.txt"), "This is alpha content.");
    await writeFile(join(testRoot, ".agent", "companies", companyB, "docs", "doc-b.txt"), "This is beta content.");
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Helper to access tools
  const getCallTool = (server: CompanyContextServer) => {
      // @ts-ignore
      const tools = (server as any).server._registeredTools;
      return async (name: string, args: any) => {
         const tool = tools[name];
         if (!tool) throw new Error(`Tool ${name} not found`);
         return await tool.handler(args);
      };
  };

  it("should ingest and query documents for a specific company", async () => {
    const server = new CompanyContextServer();
    const callTool = getCallTool(server);

    // 1. Ingest Company A
    const ingestRes = await callTool("load_company_context", { company_id: companyA });
    expect(ingestRes.content[0].text).toContain("Successfully ingested");

    // 2. Query Company A
    // Mock embedding returns 0.1 for "alpha", matching doc-a
    const queryRes = await callTool("query_company_context", { query: "alpha", company_id: companyA });
    expect(queryRes.content[0].text).toContain("This is alpha content");
    expect(queryRes.content[0].text).not.toContain("beta");

    // 3. Query Company B (should be empty initially)
    const queryResB = await callTool("query_company_context", { query: "beta", company_id: companyB });
    expect(queryResB.content[0].text).toMatch(/No context found|No relevant documents/);

    // 4. Ingest Company B
    await callTool("load_company_context", { company_id: companyB });

    // 5. Query Company B
    const queryResB2 = await callTool("query_company_context", { query: "beta", company_id: companyB });
    expect(queryResB2.content[0].text).toContain("This is beta content");
    expect(queryResB2.content[0].text).not.toContain("alpha");
  });

  it("should respect isolation between companies", async () => {
    const server = new CompanyContextServer();
    const callTool = getCallTool(server);

    await callTool("load_company_context", { company_id: companyA });

    // Query Company B for Alpha content (should not find it)
    const res = await callTool("query_company_context", { query: "alpha", company_id: companyB });
    expect(res.content[0].text).not.toContain("This is alpha content");
  });

  it("should switch active context and query without explicit company_id", async () => {
    const server = new CompanyContextServer();
    const callTool = getCallTool(server);

    // Ingest both
    await callTool("load_company_context", { company_id: companyA });
    await callTool("load_company_context", { company_id: companyB });

    // Switch to A
    const switchResA = await callTool("switch_company_context", { company_id: companyA });
    expect(switchResA.content[0].text).toContain("Successfully switched context");

    // Query without ID (should use A)
    const queryResA = await callTool("query_company_context", { query: "alpha" });
    expect(queryResA.content[0].text).toContain("This is alpha content");

    // Switch to B
    const switchResB = await callTool("switch_company_context", { company_id: companyB });
    expect(switchResB.content[0].text).toContain("Successfully switched context");

    // Query without ID (should use B)
    const queryResB = await callTool("query_company_context", { query: "beta" });
    expect(queryResB.content[0].text).toContain("This is beta content");
    expect(queryResB.content[0].text).not.toContain("alpha");
  });

  it("should handle invalid company ID gracefully", async () => {
    const server = new CompanyContextServer();
    const callTool = getCallTool(server);

    const res = await callTool("switch_company_context", { company_id: "non-existent" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Company directory not found");
  });
});
