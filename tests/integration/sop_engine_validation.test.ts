
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const { mockLLMQueue, mockGenerate, mockEmbed } = vi.hoisted(() => {
    const queue: any[] = [];
    const generate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
        console.log("Mock Generate Called. Queue length:", queue.length);
        const next = queue.shift();
        if (!next) {
            console.log("Queue empty, returning default.");
            return {
                thought: "No mock response queued.",
                tool: "none",
                args: {},
                message: "End of script."
            };
        }
        if (typeof next === 'function') {
            return await next(system, history);
        }
        return next;
    });
    const embed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1));

    return {
        mockLLMQueue: queue,
        mockGenerate: generate,
        mockEmbed: embed
    };
});

// --- Mock Setup ---

// 1. Mock LLM (shared across all components)
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mockEmbed,
            generate: mockGenerate,
        }),
        LLM: class {
            embed = mockEmbed;
            generate = mockGenerate;
        },
    };
});

// 2. Mock MCP Infrastructure (Client & Server)
import { mockToolHandlers, mockServerTools, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({
    MCP: MockMCP
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: MockMcpServer
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

// 3. Mock Child Process (prevent real spawns)
vi.mock("child_process", () => ({
    spawn: vi.fn(),
    exec: vi.fn()
}));


// --- Imports (Real Classes) ---
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";

describe("SOP Engine Validation Test", () => {
    let testRoot: string;
    let sopServer: SOPEngineServer;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;

        mockGenerate.mockImplementation(async (system: string, history: any[]) => {
             const next = mockLLMQueue.shift();
             if (!next) {
                 return {
                    thought: "No mock response queued.",
                    tool: "none",
                    args: {},
                    message: "End of script."
                 };
             }
             if (typeof next === 'function') {
                 return await next(system, history);
             }
             return next;
        });

        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "sop-validation-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });

        // 2. Initialize Servers
        // They will register tools to MockMcpServer via the static map in mock_mcp_server.ts
        sopServer = new SOPEngineServer();

        // Add mock tools for 'brain'
        mockToolHandlers.set('brain_query', async ({ query }: any) => {
            return { content: [{ type: "text", text: "No relevant past experiences found." }] };
        });
        mockToolHandlers.set('log_experience', async (args: any) => {
             return { content: [{ type: "text", text: "Experience logged." }] };
        });

        mockServerTools.set('brain', [
            {
                name: 'brain_query',
                description: 'Query past experiences',
                inputSchema: { type: "object", properties: { query: { type: "string" } } }
            },
            {
                name: 'log_experience',
                description: 'Log experience',
                inputSchema: { type: "object", properties: { summary: { type: "string" } } }
            }
        ]);
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should parse and validate Markdown SOPs correctly", async () => {
        const mcp = new MockMCP();
        const sopClient = mcp.getClient("sop_engine");

        // 1. Create a valid SOP
        const sopContent = `# Title: Hello World SOP
1. Create File
2. Print Hello
`;
        await sopClient.callTool({
            name: "sop_create",
            arguments: {
                name: "hello_world",
                content: sopContent
            }
        });

        // 2. Validate it
        const result = await sopClient.callTool({
            name: "validate_sop",
            arguments: { name: "hello_world" }
        });

        expect(result.content[0].text).toContain("SOP 'hello_world' is valid.");
        expect(result.content[0].text).toContain("Steps: 2");
    });

    it("should list available SOPs (Tool Discovery)", async () => {
        const mcp = new MockMCP();
        const sopClient = mcp.getClient("sop_engine");

        // 1. Create two SOPs
        await sopClient.callTool({
            name: "sop_create",
            arguments: { name: "sop_a", content: "# Title: SOP A\n1. Step 1" }
        });
        await sopClient.callTool({
            name: "sop_create",
            arguments: { name: "sop_b", content: "# Title: SOP B\n1. Step 1" }
        });

        // 2. List them
        const result = await sopClient.callTool({
            name: "sop_list",
            arguments: {}
        });

        expect(result.content[0].text).toContain("sop_a");
        expect(result.content[0].text).toContain("sop_b");
    });

    it("should execute SOP autonomously with Brain integration", async () => {
        const mcp = new MockMCP();
        const sopClient = mcp.getClient("sop_engine");

        // 1. Create SOP
        const sopContent = `# Title: Test Execution
1. Step One
2. Step Two
`;
        await sopClient.callTool({
            name: "sop_create",
            arguments: { name: "test_exec", content: sopContent }
        });

        // 2. Mock 'brain_query' spy
        const brainQuerySpy = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "No relevant past experiences." }] });
        mockToolHandlers.set('brain_query', brainQuerySpy);

        // 3. Mock 'log_experience' spy
        const logExperienceSpy = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Logged." }] });
        mockToolHandlers.set('log_experience', logExperienceSpy);

        // 4. Queue LLM Responses
        // Step 1: Just complete it
        mockLLMQueue.push({
            thought: "Starting step 1.",
            tool: "complete_step",
            args: { summary: "Step 1 done." }
        });

        // Step 2: Just complete it
        mockLLMQueue.push({
            thought: "Starting step 2.",
            tool: "complete_step",
            args: { summary: "Step 2 done." }
        });

        // 5. Execute
        const result = await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "test_exec", input: "Run test" }
        });

        expect(result.content[0].text).toContain("executed successfully");

        // 6. Verify Brain Integration
        expect(brainQuerySpy).toHaveBeenCalled();
        expect(logExperienceSpy).toHaveBeenCalled();
        const logCall = logExperienceSpy.mock.calls[0][0];
        expect(logCall.summary).toContain("Step 1 done");
        expect(logCall.summary).toContain("Step 2 done");
    });

    it("should retry on tool failure (Resilience)", async () => {
        const mcp = new MockMCP();
        const sopClient = mcp.getClient("sop_engine");

        // 1. Create SOP
        const sopContent = `# Title: Retry Test
1. Flaky Step
`;
        await sopClient.callTool({
            name: "sop_create",
            arguments: { name: "retry_test", content: sopContent }
        });

        // 2. Mock a flaky tool
        let attempts = 0;
        mockToolHandlers.set('flaky_tool', async () => {
            attempts++;
            if (attempts === 1) {
                throw new Error("Temporary failure!");
            }
            return { content: [{ type: "text", text: "Success!" }] };
        });
        mockServerTools.set('utils', [{
            name: 'flaky_tool',
            description: 'Sometimes fails',
            inputSchema: {}
        }]);

        // 3. Queue LLM Responses
        // Attempt 1: Call flaky tool (fails)
        mockLLMQueue.push({
            thought: "Attempting flaky tool.",
            tool: "flaky_tool",
            args: {}
        });

        // Attempt 2: Retry flaky tool (succeeds)
        mockLLMQueue.push({
            thought: "Retrying flaky tool.",
            tool: "flaky_tool",
            args: {}
        });

        // Finish Step
        mockLLMQueue.push({
            thought: "Tool succeeded.",
            tool: "complete_step",
            args: { summary: "Done after retry." }
        });

        // 4. Execute
        const result = await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "retry_test", input: "Go" }
        });

        expect(result.content[0].text).toContain("executed successfully");
        expect(attempts).toBe(2);
    });
});
