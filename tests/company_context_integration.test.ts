import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextServer } from "../src/mcp_servers/context_server.js";
import { CompanyContextServer } from "../src/mcp_servers/company_context.js";
import { ContextManager } from "../src/context/ContextManager.js";
import { Engine, Registry, Context } from "../src/engine/orchestrator.js";
import { MCP } from "../src/mcp.js";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { existsSync, readdirSync } from "fs";

// Mock LLM early
const mockEmbed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1));
const mockGenerate = vi.fn().mockResolvedValue({
  thought: "Thinking...",
  tool: "none",
  args: {},
  message: "Hello world"
});

vi.mock("../src/llm.js", () => {
  return {
    createLLM: () => ({
      embed: mockEmbed,
      generate: mockGenerate,
    }),
    LLM: vi.fn(),
  };
});

let contextServerInstance: ContextServer;
let companyServerInstance: CompanyContextServer;

// Helper to call tools on servers
async function callServerTool(server: any, name: string, args: any) {
    // Access private server property
    const mcpServer = (server as any).server;
    const tool = mcpServer._registeredTools[name];
    if (!tool) throw new Error(`Tool ${name} not found on server`);
    try {
        const res = await tool.handler(args);
        return res;
    } catch (e: any) {
        throw e;
    }
}

describe("Company Context Integration", () => {
  const testRoot = join(process.cwd(), ".agent-test-integration");

  beforeEach(async () => {
    vi.spyOn(process, "cwd").mockReturnValue(testRoot);
    if (existsSync(testRoot)) {
        await rm(testRoot, { recursive: true, force: true });
    }
    await mkdir(join(testRoot, ".agent"), { recursive: true });

    // Instantiate real servers
    contextServerInstance = new ContextServer(testRoot);
    companyServerInstance = new CompanyContextServer(); // Uses process.cwd mock

    vi.clearAllMocks();

    // Reset LLM mocks
    mockEmbed.mockResolvedValue(new Array(1536).fill(0.1));
    mockGenerate.mockResolvedValue({
      thought: "Thinking...",
      tool: "none",
      args: {},
      message: "Hello world"
    });

    // Spy on MCP methods
    vi.spyOn(MCP.prototype, "init").mockResolvedValue(undefined);
    vi.spyOn(MCP.prototype, "listServers").mockReturnValue([]);
    vi.spyOn(MCP.prototype, "startServer").mockResolvedValue("Started");
    vi.spyOn(MCP.prototype, "getTools").mockResolvedValue([]);
    vi.spyOn(MCP.prototype, "isServerRunning").mockReturnValue(false);

    vi.spyOn(MCP.prototype, "getClient").mockImplementation((name) => {
        if (name === "brain") {
            return {
                callTool: vi.fn().mockResolvedValue({
                    content: [{ type: "text", text: "Mock memory\n\n---\n\nMock memory 2" }]
                })
            } as any;
        }
        if (name === "context_server") {
            return {
                callTool: vi.fn().mockImplementation(async ({ name, arguments: args }) => {
                    return await callServerTool(contextServerInstance, name, args);
                })
            } as any;
        }
        if (name === "company_context") {
            return {
                callTool: vi.fn().mockImplementation(async ({ name, arguments: args }) => {
                    return await callServerTool(companyServerInstance, name, args);
                })
            } as any;
        }
        return undefined;
    });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("ContextServer should isolate contexts based on company arg", async () => {
    // Write Company A context
    await contextServerInstance.updateContext({ goals: ["Goal A"] }, undefined, "company-a");

    // Write Company B context
    await contextServerInstance.updateContext({ goals: ["Goal B"] }, undefined, "company-b");

    // Read Company A
    const contextA = await contextServerInstance.readContext(undefined, "company-a");
    expect(contextA.goals).toContain("Goal A");
    expect(contextA.goals).not.toContain("Goal B");

    // Read Company B
    const contextB = await contextServerInstance.readContext(undefined, "company-b");
    expect(contextB.goals).toContain("Goal B");
    expect(contextB.goals).not.toContain("Goal A");

    // Verify files
    const fileA = join(testRoot, ".agent", "companies", "company-a", "context.json");
    const fileB = join(testRoot, ".agent", "companies", "company-b", "context.json");
    expect(existsSync(fileA)).toBe(true);
    expect(existsSync(fileB)).toBe(true);
  });

  it("Engine should orchestrate company context correctly with REAL servers", async () => {
    const mcp = new MCP();
    const registry = new Registry();
    // @ts-ignore
    const llm = (await import("../src/llm.js")).createLLM();

    const engine = new Engine(llm, registry, mcp);
    // Spy on internal contextManager
    // @ts-ignore
    const loadContextSpy = vi.spyOn(engine.contextManager, "loadContext");

    const ctx = new Context(testRoot, { name: "test", description: "test", systemPrompt: "Sys" } as any);

    // Setup: Create docs for client-x
    const docsDir = join(testRoot, ".agent", "companies", "client-x", "docs");
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, "test.md"), "This is client-x documentation content.");

    // Ingest docs
    await callServerTool(companyServerInstance, "load_company_context", { company_id: "client-x" });

    // Run engine with query matching docs
    await engine.run(ctx, "Tell me about client-x", { interactive: false, company: "client-x" });

    // Verify ContextManager.loadContext called with company
    expect(loadContextSpy).toHaveBeenCalledWith("Tell me about client-x", "client-x");

    const lastUserMsg = ctx.history.find(m => m.role === "user" && m.content.includes("[Company Context RAG]"));

    expect(lastUserMsg).toBeDefined();
    expect(lastUserMsg?.content).toContain("This is client-x documentation content.");
  });

});
