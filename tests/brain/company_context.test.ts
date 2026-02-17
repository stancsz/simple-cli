import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CompanyContext } from "../../src/brain/company_context.js";
import { LLM } from "../../src/llm.js";
import { existsSync, rmSync } from "fs";
import { join } from "path";

// Mock LLM
class MockLLM extends LLM {
  constructor() {
    super({ provider: "mock", model: "mock" } as any);
  }

  async embed(text: string): Promise<number[]> {
    const val = text.length / 100;
    return new Array(1536).fill(val);
  }
}

describe("CompanyContext", () => {
  const testCompanyId = "test-company-vitest";
  const contextsDir = join(process.cwd(), ".agent", "contexts");
  const companyDir = join(contextsDir, testCompanyId);

  beforeEach(async () => {
    if (existsSync(companyDir)) {
      rmSync(companyDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (existsSync(companyDir)) {
      rmSync(companyDir, { recursive: true, force: true });
    }
  });

  it("should initialize and store documents", async () => {
    const mockLLM = new MockLLM();
    const ctx = new CompanyContext(mockLLM as any, testCompanyId);

    await ctx.init();
    expect(existsSync(join(companyDir, "config.json"))).toBe(true);

    await ctx.store("This is a test document about branding.", { type: "brand" });
    await ctx.store("This is another document about coding standards.", { type: "coding" });

    const results = await ctx.query("branding", 1);
    expect(results.length).toBe(1);
    expect(results[0].text).toContain("branding");

    const companies = await CompanyContext.listCompanies();
    expect(companies).toContain(testCompanyId);
  });
});
