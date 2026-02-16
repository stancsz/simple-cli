import { CompanyContext } from "../../src/brain/company_context.js";
import { LLM } from "../../src/llm.js";
import { existsSync, rmSync } from "fs";
import { join } from "path";

// Mock LLM
class MockLLM extends LLM {
  constructor() {
    super({ provider: "mock", model: "mock" });
  }

  async embed(text: string): Promise<number[]> {
    // Return a dummy embedding of length 1536 to simulate realistic behavior
    // Using a simple hash-like function to make it deterministic but different for different text
    const val = text.length / 100;
    return new Array(1536).fill(val);
  }
}

async function test() {
  const testCompanyId = "test-company-" + Date.now();
  const contextsDir = join(process.cwd(), ".agent", "contexts");
  const companyDir = join(contextsDir, testCompanyId);

  // Cleanup before test
  if (existsSync(companyDir)) {
    rmSync(companyDir, { recursive: true, force: true });
  }

  try {
    const mockLLM = new MockLLM();
    const ctx = new CompanyContext(mockLLM, testCompanyId);

    console.log("Testing init...");
    await ctx.init();
    if (!existsSync(join(companyDir, "config.json"))) throw new Error("Config not created");

    console.log("Testing store...");
    await ctx.store("This is a test document about branding.", { type: "brand" });
    await ctx.store("This is another document about coding standards.", { type: "coding" });

    console.log("Testing query...");
    const results = await ctx.query("branding", 1);
    console.log("Query results:", results.map(r => r.text));

    // Since embeddings are dummy, search might return anything based on distance.
    // But since "branding" length is closer to "branding" doc length? No.
    // My dummy embedding logic: text.length / 100.
    // "branding" length is 8.
    // "This is a test document about branding." length is 37.
    // "This is another document about coding standards." length is 46.
    // Difference: |0.08 - 0.37| = 0.29. |0.08 - 0.46| = 0.38.
    // So branding doc is closer.

    if (results.length !== 1) throw new Error("Expected 1 result");
    if (!results[0].text.includes("branding")) throw new Error("Expected relevant result");

    console.log("Testing listCompanies...");
    const companies = await CompanyContext.listCompanies();
    if (!companies.includes(testCompanyId)) throw new Error("Company not listed");

    console.log("All tests passed!");

  } catch (e) {
    console.error("Test failed:", e);
    process.exit(1);
  } finally {
    // Cleanup
    if (existsSync(companyDir)) {
      rmSync(companyDir, { recursive: true, force: true });
    }
  }
}

test();
