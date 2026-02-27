
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const mocks = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[],
        mockLLMGenerate: vi.fn(),
        mockEmbed: vi.fn() // Added to hoisted object
    };
});

// --- Mock Setup ---

// 1. Mock LLM (shared across all components)
// Updated to handle concurrent tasks by checking context
mocks.mockLLMGenerate.mockImplementation(async (system: string, history: any[]) => {
    // Basic check to skip default tasks if they aren't the target of the test
    const systemPrompt = system || "";
    const lastUserMessage = history[history.length - 1]?.content || "";

    // If it's the Ghost Task (based on scheduler prompt)
    if (lastUserMessage.includes("Perform background check")) {
        const next = mocks.mockLLMQueue.shift();
        if (!next) {
            return { thought: "No mock response queued.", tool: "none", args: {}, message: "End of script." };
        }
        if (typeof next === 'function') return await next(system, history);
        return next;
    }

    // Default handler for other tasks (Morning Standup, HR Review, etc.)
    return {
        thought: "Skipping non-target task.",
        tool: "none",
        args: {},
        message: "Task skipped."
    };
});

mocks.mockEmbed.mockResolvedValue(new Array(1536).fill(0.1));

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: mocks.mockEmbed,
            generate: mocks.mockLLMGenerate,
        }),
        LLM: class {
            embed = mocks.mockEmbed;
            generate = mocks.mockLLMGenerate;
        },
    };
});

// 2. Mock MCP Infrastructure
import { mockToolHandlers, mockServerTools, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({
    MCP: MockMCP
}));

// Mock Stdio Transport
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
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

// --- Imports ---
import { Scheduler } from "../../src/scheduler.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";

describe("Ghost Mode Integration Test", () => {
    let testRoot: string;
    let scheduler: Scheduler;
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
        testRoot = await mkdtemp(join(tmpdir(), "ghost-mode-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, "ghost_logs"), { recursive: true });

        // 2. Initialize Server (Brain)
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
                    id: "task-1",
                    name: "Ghost Task",
                    trigger: "cron",
                    schedule: "0 10 * * *", // 10 AM
                    prompt: "Perform background check.",
                    yoloMode: true,
                    company: "client-a"
                }
            ]
        };
        await writeFile(join(testRoot, 'scheduler.json'), JSON.stringify(schedule));

        // Set Time: 8 AM
        vi.setSystemTime(new Date('2025-01-01T08:00:00Z'));

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
    }, 20000); // 20s timeout

    it("should execute a scheduled task autonomously and log results", async () => {
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

        // Queue LLM responses
        mocks.mockLLMQueue.push({
            thought: "I am running in the background.",
            tool: "write_file",
            args: { filepath: "ghost_result.txt", content: "Ghost Success" }
        });
        mocks.mockLLMQueue.push({
            thought: "Task finished.",
            message: "Ghost check complete."
        });

        // Advance time to 10 AM
        console.log("Advancing time...");
        await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 2 + 1000 * 60); // +2h 1m

        await ghostTaskPromise;

        // Polling for file existence
        let fileExists = false;
        for (let i = 0; i < 20; i++) { // Poll for up to 2 seconds (real time, assuming test logic runs fast)
            // Note: Since we advanced timers, the simulated task SHOULD have run.
            // But node event loop processing needs to happen.
            if (existsSync(join(testRoot, "ghost_result.txt"))) {
                fileExists = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Real wait for IO
        }

        // Verify Execution
        expect(fileExists).toBe(true);
        const content = await readFile(join(testRoot, "ghost_result.txt"), "utf-8");
        expect(content).toBe("Ghost Success");
    }, 60000); // 60s timeout
});
