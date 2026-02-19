import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CompanyContextServer } from "../src/mcp_servers/company_context.js";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { Engine, Registry, Context } from "../src/engine/orchestrator.js";
import { MCP } from "../src/mcp.js";
import { createLLM } from "../src/llm.js";

// Mock LLM
vi.mock("../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: vi.fn().mockResolvedValue({
          thought: "Mocked thought",
          message: "Mocked message",
          tool: "none",
          args: {},
          raw: ""
      }),
      embed: vi.fn().mockImplementation(async (text: string) => {
        // Deterministic mock embedding
        if (text.includes("keyword-")) {
             const match = text.match(/keyword-(\d+)/);
             if (match) {
                 const num = parseInt(match[1]);
                 return new Array(1536).fill(num / 1000.0);
             }
        }

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

  it("should ingest and query documents for a specific company", async () => {
    const server = new CompanyContextServer();

    // Access internal tools map from McpServer
    // @ts-ignore
    const tools = (server as any).server._registeredTools;

    const callTool = async (name: string, args: any) => {
       const tool = tools[name];
       if (!tool) throw new Error(`Tool ${name} not found`);
       return await tool.handler(args);
    };

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
    // @ts-ignore
    const tools = (server as any).server._registeredTools;
    const callTool = async (name: string, args: any) => {
       const tool = tools[name];
       if (!tool) throw new Error(`Tool ${name} not found`);
       return await tool.handler(args);
    };

    await callTool("load_company_context", { company_id: companyA });

    // Query Company B for Alpha content (should not find it)
    const res = await callTool("query_company_context", { query: "alpha", company_id: companyB });
    expect(res.content[0].text).not.toContain("This is alpha content");
  });

  describe("Performance & Scale", () => {
    it("should handle ingestion of 100+ documents efficiently", async () => {
      // Generate 100 docs
      const docsDir = join(testRoot, ".agent", "companies", companyA, "docs");
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(writeFile(join(docsDir, `scale-doc-${i}.txt`), `This is content for document ${i} with some unique keyword-${i}`));
      }
      await Promise.all(promises);

      const server = new CompanyContextServer();
      // @ts-ignore
      const tools = (server as any).server._registeredTools;
      const callTool = async (name: string, args: any) => {
         const tool = tools[name];
         if (!tool) throw new Error(`Tool ${name} not found`);
         return await tool.handler(args);
      };

      const startTime = Date.now();
      const res = await callTool("load_company_context", { company_id: companyA });
      const duration = Date.now() - startTime;

      expect(res.content[0].text).toContain("Successfully ingested");
      // Basic perf check: 100 docs should be under 5 seconds (with mocked LLM)
      // If real embedding, it would be slower. Mock is fast.
      expect(duration).toBeLessThan(5000);

      // Verify query works on the new data
      const queryRes = await callTool("query_company_context", { query: "keyword-50", company_id: companyA });
      expect(queryRes.content[0].text).toContain("keyword-50");
    });
  });
});

describe("Engine Integration - Company Flag", () => {
  it("should propagate company flag to context tools", async () => {
    const mockMcp = new MCP();
    const mockCallTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Mock Context" }]
    });

    vi.spyOn(mockMcp, "init").mockResolvedValue(undefined);
    vi.spyOn(mockMcp, "listServers").mockReturnValue([{ name: "company_context", status: "running" }] as any);
    vi.spyOn(mockMcp, "startServer").mockResolvedValue(undefined);
    vi.spyOn(mockMcp, "getTools").mockResolvedValue([]);
    vi.spyOn(mockMcp, "getClient").mockReturnValue({
      callTool: mockCallTool
    } as any);

    const llm = createLLM();
    // Mock generate to avoid actual calls and just return valid JSON
    vi.spyOn(llm, "generate").mockResolvedValue({
      thought: "Done",
      message: "Done",
      tool: "none",
      args: {},
      raw: ""
    });

    const registry = new Registry();
    const engine = new Engine(llm, registry, mockMcp);

    const context = new Context(process.cwd(), {
      name: "test",
      description: "test",
      tools: [],
      systemPrompt: "test"
    } as any);

    // Run with company flag
    await engine.run(context, "Hello", { interactive: false, company: "client-abc" });

    // Verify callTool was called with company_id
    const calls = mockCallTool.mock.calls;
    const contextCall = calls.find((c: any) => c[0].name === "query_company_context");

    // Engine might call read_context (context_server) and query_company_context (company_context)

    if (contextCall) {
        expect(contextCall[0].arguments).toEqual(expect.objectContaining({
            company_id: "client-abc"
        }));
    } else {
        // If not found, maybe engine didn't reach that point or failed earlier?
        // Engine.run calls contextManager.loadContext first?
        // contextManager.loadContext doesn't use MCP client "company_context", it uses "context_server"?
        // Engine directly calls "company_context" MCP client for RAG injection.

        // Let's check Engine code again:
        /*
        const client = this.mcp.getClient("company_context");
          if (client) {
            const result: any = await client.callTool({
              name: "query_company_context",
              arguments: { query: input, company_id: companyName }
            });
        */
        // It happens inside the loop.
        // If `llm.generate` is mocked, the loop runs once and exits?
        // "if (!input) break;" loop.
        // It runs at least once with initialPrompt.
    }

    // We expect at least one call to query_company_context if companyName is provided.
    expect(calls).toEqual(expect.arrayContaining([
        expect.arrayContaining([
            expect.objectContaining({
                name: "query_company_context",
                arguments: expect.objectContaining({ company_id: "client-abc" })
            })
        ])
    ]));
  });
});
