import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { writeFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as lancedb from '@lancedb/lancedb';

// Mocks must be defined before imports
// 1. Mock LLM
vi.mock('../src/llm.js', () => ({
  createLLM: () => ({
    embed: async (text: string) => new Array(1536).fill(0.1),
    generate: async () => ({ thought: "Thinking...", message: "Response", usage: {} })
  }),
}));

// 2. Mock McpServer to capture tools
const toolHandlers = new Map<string, Function>();
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class MockMcpServer {
      constructor(info: any) {}
      tool(name: string, description: string, schema: any, handler: Function) {
        toolHandlers.set(name, handler);
      }
      async connect(transport: any) {}
    }
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {}
}));

// 3. Mock Engine dependencies for integration test
const mockCallTool = vi.fn();
const mockGetClient = vi.fn().mockReturnValue({
    callTool: mockCallTool
});

vi.mock('../src/mcp.js', () => ({
    MCP: class {
        init = vi.fn();
        listServers = vi.fn().mockReturnValue([]);
        startServer = vi.fn();
        getTools = vi.fn().mockResolvedValue([]);
        getClient = mockGetClient;
    }
}));

const mockUpdateContext = vi.fn();
const mockLoadContext = vi.fn().mockResolvedValue({});

vi.mock('../src/context/ContextManager.js', () => ({
    ContextManager: class {
        loadContext = mockLoadContext;
        updateContext = mockUpdateContext;
    }
}));

// Dynamic Import helper to avoid issues with mocked modules
// import { CompanyContextServer } from '../src/mcp_servers/company_context/index.js';
// import { Engine, Registry } from '../src/engine/orchestrator.js';

describe('Company Context Integration', async () => {
  let CompanyContextServer: any;
  let Engine: any;
  let Registry: any;
  let MCP: any;

  const testDir = join(process.cwd(), '.agent', 'test_company_context');
  const companyName = 'test-company-a';
  const docPath = join(testDir, 'profile.md');

  beforeEach(async () => {
    // Import modules dynamically after mocks are set up
    const serverModule = await import('../src/mcp_servers/company_context/index.js');
    CompanyContextServer = serverModule.CompanyContextServer;
    const engineModule = await import('../src/engine/orchestrator.js');
    Engine = engineModule.Engine;
    Registry = engineModule.Registry;
    const mcpModule = await import('../src/mcp.js');
    MCP = mcpModule.MCP;

    process.env.BRAIN_STORAGE_ROOT = join(testDir, 'brain');
    if (!existsSync(testDir)) {
        await mkdir(testDir, { recursive: true });
    }
    await writeFile(docPath, "# Company Profile\n\nBrand Voice: Professional and Concise.\n\nOnboarding: Read the docs.");
    toolHandlers.clear();
    mockCallTool.mockClear();
    mockGetClient.mockClear();
    mockUpdateContext.mockClear();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('MCP Server', () => {
      it('should register required tools', () => {
        new CompanyContextServer();
        expect(toolHandlers.has('store_company_document')).toBe(true);
        expect(toolHandlers.has('load_company_context')).toBe(true);
        expect(toolHandlers.has('query_company_memory')).toBe(true);
      });

      it('should store a company document', async () => {
        new CompanyContextServer();
        const handler = toolHandlers.get('store_company_document');
        expect(handler).toBeDefined();

        const result = await handler!({
          company_name: companyName,
          document_path: docPath
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain(`Successfully stored document for ${companyName}`);

        // Verify DB directly
        const db = await lancedb.connect(process.env.BRAIN_STORAGE_ROOT!);
        const table = await db.openTable(`company_${companyName}`);
        const rows = await table.query().toArray();
        expect(rows.length).toBe(1);
        expect(rows[0].id).toBe(docPath);
      });

      it('should load company context', async () => {
        new CompanyContextServer();

        // First store
        const storeHandler = toolHandlers.get('store_company_document');
        await storeHandler!({ company_name: companyName, document_path: docPath });

        // Then load
        const loadHandler = toolHandlers.get('load_company_context');
        const result = await loadHandler!({ company_name: companyName });

        expect(result.content[0].text).toContain("Brand Voice: Professional and Concise");
      });

      it('should query company memory', async () => {
        new CompanyContextServer();

        // First store
        const storeHandler = toolHandlers.get('store_company_document');
        await storeHandler!({ company_name: companyName, document_path: docPath });

        // Then query
        const queryHandler = toolHandlers.get('query_company_memory');
        const result = await queryHandler!({ company_name: companyName, query: "brand voice" });

        expect(result.content[0].text).toContain("Brand Voice: Professional and Concise");
      });
  });

  describe('Engine Integration', () => {
    it('should call load_company_context on initialization if company flag is set', async () => {
        const engine = new Engine(
            { generate: vi.fn().mockResolvedValue({ thought: "", message: "", usage: {} }) } as any, // Mock LLM
            new Registry(),
            new MCP()
        );

        // Mock load_company_context response
        mockCallTool.mockImplementation(async (args) => {
            if (args.name === 'load_company_context') {
                return { content: [{ type: 'text', text: 'Mock Profile Context' }] };
            }
            if (args.name === 'read_context') return { content: [] };
            return { content: [] };
        });

        // Run engine with AbortSignal that immediately aborts loop?
        // Engine.run has a loop `while(true)`. We need to break it.
        // We can mock `getUserInput` to return undefined immediately to break the loop.
        // Engine's getUserInput is protected, but we can override it via subclass or mock if possible.
        // Or we can rely on `process.stdin.isTTY` check?
        // If we set interactive: false, it throws if input is missing.
        // If we provide `initialPrompt`, it runs one turn.
        // But `while(true)` continues until `input` is undefined.
        // `getUserInput` returns undefined if non-interactive.

        // If we pass `initialPrompt: undefined` and `interactive: false`, it breaks immediately?
        // `if (!input) input = await this.getUserInput(...)`.
        // `getUserInput` returns undefined if !interactive.
        // `if (!input) break;`

        // So calling run with undefined prompt and interactive: false should run initialization and then exit loop.

        await engine.run(
            { history: [], skill: { systemPrompt: "" }, buildPrompt: async () => "" } as any,
            undefined,
            { interactive: false, company: 'client-test' }
        );

        expect(mockGetClient).toHaveBeenCalledWith('company_context');
        expect(mockCallTool).toHaveBeenCalledWith({
            name: 'load_company_context',
            arguments: { company_name: 'client-test' }
        });
        expect(mockUpdateContext).toHaveBeenCalledWith(
            { company_profile: 'Mock Profile Context' },
            undefined,
            'client-test'
        );
    });
  });
});
