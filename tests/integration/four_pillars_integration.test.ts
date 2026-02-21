
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
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

const mockEmbed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1));

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

// 4. Mock Scheduler Trigger (run in-process)
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: async (task: any) => {
        // Run task logic in-process using the same mocks
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

describe("Four Pillars Integration Test (Definitive)", () => {
    let testRoot: string;
    let scheduler: Scheduler;

    // Servers
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        // Use a random suffix to avoid collision, but cleaner path
        testRoot = await mkdtemp(join(tmpdir(), "four-pillars-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "logs"), { recursive: true }); // For autonomous logs
        await mkdir(join(testRoot, "logs"), { recursive: true }); // For HR logs

        // 2. Initialize Servers
        // They will register tools to MockMcpServer via the static map in mock_mcp_server.ts
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();

        // Add a mock 'write_file' tool for AutonomousOrchestrator usage (if needed)
        // Usually provided by 'filesystem' MCP, but we can mock it here
        mockToolHandlers.set('write_file', async ({ filepath, content }: any) => {
            await writeFile(join(testRoot, filepath), content);
            return { content: [{ type: "text", text: "File written." }] };
        });
        mockServerTools.set('filesystem', [{
            name: 'write_file',
            description: 'Write file',
            inputSchema: {}
        }]);

        // 3. Initialize Scheduler
        scheduler = new Scheduler(testRoot);
        // We don't rely on start() for scheduling anymore, but we might need it for state init
        await scheduler.start();
    });

    afterEach(async () => {
        if (scheduler) await scheduler.stop();
        // Give a grace period for handles to close
        await new Promise(resolve => setTimeout(resolve, 100));
        try {
            await rm(testRoot, { recursive: true, force: true });
        } catch (e) {
            console.warn(`[Cleanup] Failed to remove ${testRoot}:`, e);
        }
        vi.restoreAllMocks();
    });

    it("should execute the full 4-Pillar Workflow in sequence", async () => {
        const mcp = new MockMCP(); // Client to call tools

        // ==========================================
        // Pillar 1: Company Context Onboarding
        // ==========================================
        console.log("--- Phase 1: Company Context ---");

        // 1.1 Create Company Docs
        const companyId = "test-corp";
        const docsDir = join(testRoot, ".agent", "companies", companyId, "docs");
        await mkdir(docsDir, { recursive: true });
        await writeFile(join(docsDir, "mission.md"), "# Mission\nTo build the best AI agents.");

        // 1.2 Load Context
        const companyClient = mcp.getClient("company_context");
        const loadRes = await companyClient.callTool({
            name: "load_company_context",
            arguments: { company_id: companyId }
        });
        expect(loadRes.content[0].text).toContain("Successfully ingested");

        // 1.3 Query Context (Verify tool works)
        const queryRes = await companyClient.callTool({
            name: "query_company_context",
            arguments: { query: "What is our mission?", company_id: companyId }
        });
        // Since we mock embed to constant, and use real LanceDB, it might return results if vector match works.
        // Or it might be empty if distance is too far.
        // Assuming load worked, we should at least get a result object.
        // Check for success or specific error handling if empty.
        // If real LanceDB is used with mock embeddings, search logic holds.
        // We accept either result text or "No relevant documents" but NOT an error.
        expect(queryRes.isError).toBeFalsy();


        // ==========================================
        // Pillar 2: SOP Execution
        // ==========================================
        console.log("--- Phase 2: SOP Execution ---");

        const sopClient = mcp.getClient("sop_engine");

        // 2.1 Create SOP
        await sopClient.callTool({
            name: "sop_create",
            arguments: {
                name: "deploy_app",
                content: "# Title: Deployment SOP\n1. Check Repo\n2. Build\n3. Deploy"
            }
        });

        // 2.2 Execute SOP
        // Queue LLM responses for the SOP Executor
        // Step 1: Check Repo
        mockLLMQueue.push({
            thought: "I need to check the repo.",
            tool: "write_file", // simulating some action
            args: { filepath: "status.txt", content: "repo clean" }
        });
        mockLLMQueue.push({
            thought: "Repo checked.",
            tool: "complete_step",
            args: { summary: "Repository is clean." }
        });

        // Step 2: Build
        mockLLMQueue.push({
            thought: "Building...",
            tool: "none",
            args: {},
            message: "Build complete."
        });
        mockLLMQueue.push({
             thought: "Build done.",
             tool: "complete_step",
             args: { summary: "Build successful." }
        });

        // Step 3: Deploy
        mockLLMQueue.push({
            thought: "Deploying...",
            tool: "none",
            args: {},
            message: "Deployed."
        });
        mockLLMQueue.push({
             thought: "Deployment done.",
             tool: "complete_step",
             args: { summary: "Deployment successful." }
        });

        const sopRes = await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "deploy_app", input: "Deploy v1" }
        });

        expect(sopRes.content[0].text).toContain("SOP 'Title: Deployment SOP' executed successfully");


        // ==========================================
        // Pillar 3: Ghost Mode (Autonomous Task)
        // ==========================================
        console.log("--- Phase 3: Ghost Mode ---");

        // Queue LLM responses for AutonomousOrchestrator running "Ghost Task"
        mockLLMQueue.push({
            thought: "I am running in the background.",
            tool: "write_file",
            args: { filepath: "ghost_log.txt", content: "Ghost was here" }
        });
        mockLLMQueue.push({
            thought: "Task finished.",
            message: "Ghost check complete."
        });

        // Manually trigger task
        const ghostTask = {
            id: "task-ghost",
            name: "Ghost Task",
            trigger: "cron",
            schedule: "* * * * *",
            prompt: "Perform background check.",
            yoloMode: true,
            company: "test-corp"
        };
        await (scheduler as any).runTask(ghostTask);

        expect(existsSync(join(testRoot, "ghost_log.txt"))).toBe(true);


        // ==========================================
        // Pillar 4: HR Loop
        // ==========================================
        console.log("--- Phase 4: HR Loop ---");

        // Queue LLM responses for HR Review
        // 1. AutonomousOrchestrator picks up "HR Review" task
        mockLLMQueue.push({
            thought: "Time for HR review.",
            tool: "perform_weekly_review", // Uses HR tool
            args: {}
        });

        // 2. HR Server internal LLM call (performAnalysis)
        mockLLMQueue.push({
            message: JSON.stringify({
                title: "Improve Deployment Speed",
                description: "Parallelize build steps.",
                improvement_needed: true,
                analysis: "Build takes too long.",
                affected_files: ["docs/sops/deploy_app.md"],
                patch: "Parallelize."
            })
        });

        // 3. Supervisor Verification (for perform_weekly_review)
        mockLLMQueue.push({
            thought: "Verification.",
            message: "Verification passed."
        });

        // 4. Agent - finish task
         mockLLMQueue.push({
            thought: "HR Review complete.",
            message: "Done."
        });

        // Manually trigger HR Task
        const hrTask = {
            id: "task-hr",
            name: "HR Review",
            trigger: "cron",
            schedule: "* * * * *",
            prompt: "Analyze team performance.",
            yoloMode: true
        };
        await (scheduler as any).runTask(hrTask);

        // Verify Proposal
        const hrClient = mcp.getClient("hr_loop");

        const pendingRes = await hrClient.callTool({
            name: "list_pending_proposals",
            arguments: {}
        });

        expect(pendingRes.content[0].text).toContain("Improve Deployment Speed");
    });
});
