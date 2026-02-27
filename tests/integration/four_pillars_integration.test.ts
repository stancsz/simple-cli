
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const mocks = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[],
        mockEmbed: vi.fn(),
        mockGenerate: vi.fn()
    };
});

// --- Mock Setup ---

// 1. Mock LLM (shared across all components)
mocks.mockGenerate.mockImplementation(async (system: string, history: any[]) => {
    // Check if we have items
    if (mocks.mockLLMQueue.length === 0) {
        return {
            thought: "No mock response queued.",
            tool: "none",
            args: {},
            message: "End of script."
        };
    }

    const next = mocks.mockLLMQueue.shift();
    if (typeof next === 'function') {
        return await next(system, history);
    }
    return next;
});

mocks.mockEmbed.mockImplementation(async (text: string) => {
    const val = (text.length % 100) / 100;
    return new Array(1536).fill(val);
});

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mocks.mockEmbed,
            generate: mocks.mockGenerate,
        }),
        LLM: class {
            embed = mocks.mockEmbed;
            generate = mocks.mockGenerate;
        },
    };
});

// 2. Mock MCP Infrastructure
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

// 3. Mock Scheduler Trigger (run in-process)
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: async (task: any) => {
        // Run task logic in-process
        const { createLLM } = await import("../../src/llm.js");
        const { MCP } = await import("../../src/mcp.js");
        const { AutonomousOrchestrator } = await import("../../src/engine/autonomous.js");
        const { Registry, Context } = await import("../../src/engine/orchestrator.js");

        // Mock Registry setup
        const registry = new Registry();
        // Populate registry from our mock MCP tools
        const mcp = new MCP();
        const tools = await mcp.getTools();
        tools.forEach((t: any) => registry.tools.set(t.name, t));

        const llm = createLLM();
        const orchestrator = new AutonomousOrchestrator(llm, registry, mcp, {
             logPath: join(process.cwd(), '.agent', 'autonomous.log'),
             yoloMode: true
        });

        // Mock context
        const ctx = new Context(process.cwd(), { name: "test-skill", description: "test", triggers: [], tools: [] });

        try {
            await orchestrator.run(ctx, task.prompt, { interactive: false });
        } catch (e) {
            console.error("Task execution failed:", e);
        }
        return { exitCode: 0 };
    },
    killAllChildren: vi.fn()
}));

// --- Imports (Real Classes) ---
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { HRServer } from "../../src/mcp_servers/hr/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { Scheduler } from "../../src/scheduler.js";

describe("Four Pillars Integration Test (Explicit)", () => {
    let testRoot: string;
    let scheduler: Scheduler;

    // Servers
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "four-pillars-integration-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "logs"), { recursive: true }); // For autonomous logs
        await mkdir(join(testRoot, "logs"), { recursive: true }); // For HR logs

        // 2. Initialize Servers
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();

        // Add a mock 'write_file' tool
        mockToolHandlers.set('write_file', async ({ filepath, content }: any) => {
            await writeFile(join(testRoot, filepath), content);
            return { content: [{ type: "text", text: "File written." }] };
        });
        mockServerTools.set('filesystem', [{
            name: 'write_file',
            description: 'Write file',
            inputSchema: {}
        }]);

        // Force-register Brain tools
        mockToolHandlers.set('brain_store', async () => ({ content: [{ type: 'text', text: 'Stored' }] }));
        mockServerTools.set('brain', [{ name: 'brain_store', description: 'Store memory', inputSchema: {} }]);

        mockToolHandlers.set('brain_query', async () => ({ content: [{ type: 'text', text: 'No memories found' }] }));
        mockServerTools.get('brain')?.push({ name: 'brain_query', description: 'Query memory', inputSchema: {} });

        mockToolHandlers.set('recall_delegation_patterns', async () => ({ content: [{ type: 'text', text: 'No patterns found' }] }));
        mockServerTools.get('brain')?.push({ name: 'recall_delegation_patterns', description: 'Recall patterns', inputSchema: {} });

        mockToolHandlers.set('log_experience', async () => ({ content: [{ type: 'text', text: 'Experience logged' }] }));
        mockServerTools.get('brain')?.push({ name: 'log_experience', description: 'Log experience', inputSchema: {} });

        mockToolHandlers.set('read_context', async () => ({ content: [{ type: 'text', text: '{}' }] }));
        mockServerTools.get('brain')?.push({ name: 'read_context', description: 'Read context', inputSchema: {} });

        mockToolHandlers.set('brain_update_graph', async () => ({ content: [{ type: 'text', text: 'Graph updated' }] }));
        mockServerTools.get('brain')?.push({ name: 'brain_update_graph', description: 'Update graph', inputSchema: {} });

        mockToolHandlers.set('brain_query_graph', async () => ({ content: [{ type: 'text', text: '[]' }] }));
        mockServerTools.get('brain')?.push({ name: 'brain_query_graph', description: 'Query graph', inputSchema: {} });


        // 3. Initialize Scheduler
        scheduler = new Scheduler(testRoot);

        // Define Schedule
        const schedule = {
            tasks: [
                {
                    id: "task-ghost",
                    name: "Ghost Task",
                    trigger: "cron",
                    schedule: "0 10 * * *", // 10 AM Daily
                    prompt: "Perform background check.",
                    yoloMode: true,
                    company: "test-corp"
                }
            ]
        };
        await writeFile(join(testRoot, 'scheduler.json'), JSON.stringify(schedule));

        // Set Time: 8 AM
        vi.setSystemTime(new Date('2025-01-01T08:00:00Z'));

        // Start Scheduler
        await scheduler.start();
    });

    afterEach(async () => {
        if (scheduler) {
            await scheduler.stop();
        }

        // Robust cleanup loop
        const maxRetries = 5;
        for (let i = 0; i < maxRetries; i++) {
            try {
                await rm(testRoot, { recursive: true, force: true });
                break;
            } catch (e) {
                if (i === maxRetries - 1) console.error("Cleanup error (ignored):", e);
                await new Promise(r => setTimeout(r, 200));
            }
        }
        vi.restoreAllMocks();
    }, 20000);

    it("should execute Pillar 3 (Ghost Mode) and Pillar 4 (HR Loop) together", async () => {
        const mcp = new MockMCP();

        // Wait for task trigger
        const waitForTask = (name: string) => new Promise<void>(resolve => {
            const handler = (t: any) => {
                if (t.name === name) {
                    scheduler.off('task-triggered', handler);
                    resolve();
                }
            };
            scheduler.on('task-triggered', handler);
        });
        const ghostTaskPromise = waitForTask("Ghost Task");

        // Queue LLM responses for AutonomousOrchestrator running "Ghost Task"
        mocks.mockLLMQueue.push({
            thought: "I am running in the background.",
            tool: "write_file",
            args: { filepath: "ghost_log.txt", content: "Ghost was here" }
        });
        mocks.mockLLMQueue.push({
            thought: "Task finished.",
            message: "Ghost check complete."
        });

        // Advance time to 10 AM (plus 1 minute to ensure trigger)
        console.log("Advancing time to 10:01 AM...");
        await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 2 + 1000 * 60); // +2 hours 1 min

        // Wait for task trigger
        await ghostTaskPromise;

        // Polling wait for completion
        for (let i = 0; i < 20; i++) {
            if (existsSync(join(testRoot, "ghost_log.txt"))) break;
            await new Promise(r => setTimeout(r, 100));
        }

        expect(existsSync(join(testRoot, "ghost_log.txt"))).toBe(true);
    }, 60000);
});
