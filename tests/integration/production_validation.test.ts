
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";

// --- Hoisted Variables ---
const { mockLLMQueue } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[]
    };
});

// --- Mock Setup ---

// 1. Mock LLM (shared across all components)
const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
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

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    // Generate a pseudo-embedding based on text length/hash to allow simple vector search
    // This is a naive mock, but better than constant for checking "different" vectors
    const val = text.length % 100 / 100;
    return new Array(1536).fill(val);
});

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
        // For this test, we simulate the effect of the task by interacting with Brain or FS directly
        // or by verifying the trigger happened.
        // We can simulate an "autonomous run" by consuming mockLLMQueue items if needed.

        // Simulating Job execution
        console.log(`[MockTrigger] Executing task: ${task.name}`);

        // If there's a queued mock function for the task, run it
        if (mockLLMQueue.length > 0 && typeof mockLLMQueue[0] === 'function') {
             const fn = mockLLMQueue.shift();
             await fn(task);
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

describe("Production Validation Test (Multi-Tenant & 4-Pillar)", () => {
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
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "prod-validation-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "logs"), { recursive: true });
        await mkdir(join(testRoot, "logs"), { recursive: true });
        await mkdir(join(testRoot, "ghost_logs"), { recursive: true });

        // 2. Initialize Servers
        // They register tools to MockMcpServer
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();

        // Start servers manually (in real app they start via stdio, here we just need them instantiated)
        // We can call .run() but it might block if not handled, MockMcpServer connects instantly.

        // 3. Initialize Scheduler
        scheduler = new Scheduler(testRoot);

        // Define Schedule
        const schedule = {
            tasks: [
                {
                    id: "task-ghost",
                    name: "Morning Standup",
                    trigger: "cron",
                    schedule: "0 9 * * *", // 9 AM
                    prompt: "Run standup.",
                    yoloMode: true,
                    company: "client-a"
                },
                {
                    id: "task-hr",
                    name: "Daily HR Review",
                    trigger: "cron",
                    schedule: "0 12 * * *", // 12 PM
                    prompt: "Analyze logs.",
                    yoloMode: true
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
        await scheduler.stop();
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should validate full production workflow: Multi-Tenancy, SOPs, Ghost Mode, HR Loop", async () => {
        const mcp = new MockMCP();

        // ==========================================
        // Scenario 1: Multi-Tenant Company Context
        // ==========================================
        console.log("--- Scenario 1: Multi-Tenancy ---");

        // Create Client A docs
        const clientADocs = join(testRoot, ".agent", "companies", "client-a", "docs");
        await mkdir(clientADocs, { recursive: true });
        await writeFile(join(clientADocs, "policy.md"), "Client A Policy: Always use TypeScript.");

        // Create Client B docs
        const clientBDocs = join(testRoot, ".agent", "companies", "client-b", "docs");
        await mkdir(clientBDocs, { recursive: true });
        await writeFile(join(clientBDocs, "policy.md"), "Client B Policy: Python only.");

        // Ingest Client A
        const companyClient = mcp.getClient("company_context");
        await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: "client-a" }
        });

        // Ingest Client B
        await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: "client-b" }
        });

        // Query Client A (Expect A's policy)
        // We rely on mockEmbed returning different values for different texts,
        // but since we are using real LanceDB in temp dir, it should work if embeddings are consistent.
        const resA = await companyClient.callTool({
            name: "query_company_context",
            arguments: { query: "What is the policy?", company_id: "client-a" }
        });
        expect(resA.content[0].text).toContain("Client A Policy");
        expect(resA.content[0].text).not.toContain("Client B Policy");

        // Query Client B (Expect B's policy)
        const resB = await companyClient.callTool({
            name: "query_company_context",
            arguments: { query: "What is the policy?", company_id: "client-b" }
        });
        expect(resB.content[0].text).toContain("Client B Policy");
        expect(resB.content[0].text).not.toContain("Client A Policy");


        // ==========================================
        // Scenario 2: SOP Execution (Onboarding)
        // ==========================================
        console.log("--- Scenario 2: SOP Execution ---");

        // Create SOP
        const sopContent = `# Title: Onboarding\n1. Check Access\n2. Setup Environment`;
        await writeFile(join(testRoot, "docs", "sops", "onboarding.md"), sopContent);

        // Prepare LLM responses for SOP execution
        // Step 1: Check Access
        mockLLMQueue.push({
            thought: "Checking access...",
            tool: "none",
            args: {},
            message: "Access granted."
        });
        mockLLMQueue.push({
             thought: "Access checked.",
             tool: "complete_step",
             args: { summary: "Access confirmed." }
        });

        // Step 2: Setup Env
        mockLLMQueue.push({
            thought: "Setting up env...",
            tool: "none",
            args: {},
            message: "Env ready."
        });
        mockLLMQueue.push({
             thought: "Setup done.",
             tool: "complete_step",
             args: { summary: "Environment setup complete." }
        });

        const sopClient = mcp.getClient("sop_engine");
        const sopRes = await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "onboarding", input: "New hire: John" }
        });

        expect(sopRes.content[0].text).toContain("SOP 'Title: Onboarding' executed successfully");


        // ==========================================
        // Scenario 3: Ghost Mode (Scheduled Task)
        // ==========================================
        console.log("--- Scenario 3: Ghost Mode ---");

        const ghostTaskPromise = new Promise<void>(resolve => {
            const handler = (t: any) => {
                if (t.name === "Morning Standup") {
                    scheduler.off('task-triggered', handler);
                    resolve();
                }
            };
            scheduler.on('task-triggered', handler);
        });

        // Queue LLM response for Morning Standup
        mockLLMQueue.push(async (task: any) => {
             console.log("[MockTask] Performing Morning Standup...");
             // Simulate calling a tool if needed
        });

        // Advance time to 9 AM
        await vi.advanceTimersByTimeAsync(1000 * 60 * 60 + 1000 * 60); // +1h 1m

        await ghostTaskPromise;

        // Verify log was created in ghost_logs
        // Since JobDelegator writes to logsDir, we check that
        const logsDir = join(testRoot, "ghost_logs");
        // Check if any file exists in logsDir
        const { readdir } = await import("fs/promises");
        const logs = await readdir(logsDir);
        expect(logs.length).toBeGreaterThan(0);

        // Verify Brain received the experience log (via JobDelegator)
        // We can verify this by querying the Brain
        const brainClient = mcp.getClient("brain");
        // Wait a bit for async operations in JobDelegator
        await vi.advanceTimersByTimeAsync(1000);

        // JobDelegator logs experience with task_type "Morning Standup"
        const memoryRes = await brainClient.callTool({
            name: "recall_delegation_patterns",
            arguments: { task_type: "Morning Standup", company: "client-a" }
        });
        expect(memoryRes.content[0].text).toContain("Found 1 relevant experiences");


        // ==========================================
        // Scenario 4: HR Loop (Self-Correction)
        // ==========================================
        console.log("--- Scenario 4: HR Loop ---");

        // Simulate a failure log
        await writeFile(join(testRoot, "logs", "error.log"),
            JSON.stringify({ timestamp: Date.now(), level: "error", message: "Deployment failed due to timeout." })
        );

        const hrTaskPromise = new Promise<void>(resolve => {
            const handler = (t: any) => {
                if (t.name === "Daily HR Review") {
                    scheduler.off('task-triggered', handler);
                    resolve();
                }
            };
            scheduler.on('task-triggered', handler);
        });

        // Queue LLM response for HR Analysis
        // The JobDelegator calls 'handleTaskTrigger', which we mocked.
        // But the task prompt says "Run the Daily HR Review using 'analyze_logs'..."
        // In a real scenario, the Orchestrator would run this.
        // Here, our mocked 'handleTaskTrigger' executes the task.
        // We need to simulate what the Orchestrator would do: call HR tool.

        // We can inject a function into mockLLMQueue that 'handleTaskTrigger' will execute
        mockLLMQueue.push(async (task: any) => {
             // Simulate Orchestrator calling analyze_logs
             const hrClient = mcp.getClient("hr_loop");
             await hrClient.callTool({
                 name: "analyze_logs",
                 arguments: { limit: 5 }
             });
        });

        // Prepare LLM response for 'analyze_logs' inside HR Server
        mockLLMQueue.push({
            message: JSON.stringify({
                title: "Increase Timeout",
                description: "Fix deployment timeout.",
                improvement_needed: true,
                analysis: "Timeouts occurring.",
                affected_files: ["config.json"],
                patch: "timeout: 600"
            })
        });

        // Advance time to 12 PM
        await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 3); // +3h (from 9 to 12)

        await hrTaskPromise;
        await vi.advanceTimersByTimeAsync(1000);

        // Verify Proposal Created
        const hrClient = mcp.getClient("hr_loop");
        const pendingRes = await hrClient.callTool({
            name: "list_pending_proposals",
            arguments: {}
        });
        expect(pendingRes.content[0].text).toContain("Increase Timeout");


        // ==========================================
        // Scenario 5: Persistence & Restart
        // ==========================================
        console.log("--- Scenario 5: Persistence ---");

        // Stop everything
        await scheduler.stop();

        // Instantiate new servers (simulating restart)
        const newBrainServer = new BrainServer();
        const newCompanyServer = new CompanyContextServer();
        const newMcp = new MockMCP(); // Connect to new servers (via mock registry which is static)

        // NOTE: In our Mock setup, 'mockServerTools' and 'mockToolHandlers' are static/global.
        // Re-instantiating servers re-registers tools, which is fine.
        // But the STATE of the servers (memory, lancedb connection) needs to be persistent.
        // 1. LanceDB (Company Context) is file-based in 'testRoot', so it should persist.
        // 2. Brain (EpisodicMemory) uses LanceDB in 'testRoot/.agent/brain/episodic', so it should persist.

        // Verify Company Context Persistence
        const persistResA = await newMcp.getClient("company_context").callTool({
            name: "query_company_context",
            arguments: { query: "policy", company_id: "client-a" }
        });
        expect(persistResA.content[0].text).toContain("Client A Policy");

        // Verify Brain Persistence
        const persistBrainRes = await newMcp.getClient("brain").callTool({
             name: "recall_delegation_patterns",
             arguments: { task_type: "Morning Standup", company: "client-a" }
        });
        expect(persistBrainRes.content[0].text).toContain("Found 1 relevant experiences");

    });
});
