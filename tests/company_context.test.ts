import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextManager } from "../src/context_manager";
import { VectorStore } from "../src/memory/vector_store";
import { join } from "path";

// Mock VectorStore to avoid actual DB operations and focus on path logic
vi.mock("../src/memory/vector_store", () => {
  return {
    VectorStore: vi.fn().mockImplementation((cwd, model, company) => {
      return {
        add: vi.fn(),
        search: vi.fn(),
        close: vi.fn(),
        company: company
      };
    })
  };
});

describe("ContextManager with Company Context", () => {
  const testDir = process.cwd();
  const companyName = "test-company-123";
  const companyContextFile = join(testDir, ".agent", "companies", companyName, "context.json");

  beforeEach(() => {
    vi.resetModules();
    delete process.env.JULES_COMPANY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.JULES_COMPANY;
  });

  it("should use default context file when JULES_COMPANY is not set", () => {
    const cm = new ContextManager(testDir);
    // access private property via any
    expect((cm as any).contextFile).toBe(join(testDir, ".agent", "context.json"));
  });

  it("should use company-specific context file when JULES_COMPANY is set", () => {
    process.env.JULES_COMPANY = companyName;
    const cm = new ContextManager(testDir);
    expect((cm as any).contextFile).toBe(companyContextFile);
  });

  it("should pass company name to VectorStore when JULES_COMPANY is set", () => {
    process.env.JULES_COMPANY = companyName;
    // @ts-ignore: Mocking allows extra args
    new ContextManager(testDir);
    // Check if VectorStore was called with the company name as 3rd argument
    expect(VectorStore).toHaveBeenCalledWith(testDir, undefined, companyName);
  });
});
