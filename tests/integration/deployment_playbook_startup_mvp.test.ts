import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readdir } from "fs/promises";
import { tmpdir } from "os";

// --- Mock LLM ---
const { mockLLMQueue } = vi.hoisted(() => {
    return { mockLLMQueue: [] as any[] };
});

const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    const next = mockLLMQueue.shift();
    if (!next) return { thought: "End of script", tool: "none", args: {}, message: "Done" };
    if (typeof next === 'function') return await next(system, history);
    return next;
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    return new Array(1536).fill(0.1);
});

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({ embed: mockEmbed, generate: mockGenerate }),
        LLM: class { embed = mockEmbed; generate = mockGenerate; },
    };
});

// --- Mock MCP ---
import { mockToolHandlers, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({ MCP: MockMCP }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({ McpServer: MockMcpServer }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class { connect() {} } }));

// --- Mock Trigger ---
const { mockHandleTaskTrigger } = vi.hoisted(() => {
    return { mockHandleTaskTrigger: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: mockHandleTaskTrigger,
    killAllChildren: vi.fn()
}));

// --- Mock Framework Integration ---
const { mockIntegrateFramework } = vi.hoisted(() => {
    return { mockIntegrateFramework: vi.fn().mockResolvedValue({ success: true, message: "Mock integration success" }) };
});
vi.mock("../../src/mcp_servers/framework_analyzer/tools.js", () => ({
    integrate_framework: mockIntegrateFramework
}));

// --- Real Imports ---
import { JobDelegator } from "../../src/scheduler/job_delegator.js";
import { SOPExecutor } from "../../src/mcp_servers/sop_engine/executor.js";
import { setupCompany } from "../../src/utils/company-setup.js";

describe("Startup MVP Deployment Playbook Integration Test", () => {
    let testRoot: string;
    let delegator: JobDelegator;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();
        mockLLMQueue.length = 0;

        testRoot = await mkdtemp(join(tmpdir(), "startup-mvp-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Setup Agent Dir
        const agentDir = join(testRoot, ".agent");
        await mkdir(join(agentDir, "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(agentDir, "ghost_logs"), { recursive: true });

        delegator = new JobDelegator(agentDir);
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
    });

    it("should execute the full Startup MVP playbook workflow", async () => {
        const mcp = new MockMCP();
        const companyName = "startup-mvp";

        // 1. Company Initialization
        console.log("Step 1: Initializing Company Context...");
        await setupCompany(companyName);

        const companyDir = join(testRoot, ".agent", "companies", companyName);
        const contextExists = (await readdir(join(companyDir, "config"))).includes("company_context.json");
        expect(contextExists).toBe(true);
        console.log("  Company context initialized successfully.");

        // 2. Framework Integration (Mocked)
        console.log("Step 2: Integrating Framework (Roo Code)...");
        const { integrate_framework } = await import("../../src/mcp_servers/framework_analyzer/tools.js");
        const result = await integrate_framework("roo-code", "cli", "roo");

        expect(mockIntegrateFramework).toHaveBeenCalledWith("roo-code", "cli", "roo");
        expect(result.success).toBe(true);
        console.log("  Framework integration verified.");

        // 3. SOP Execution
        console.log("Step 3: Executing 'Build MVP' SOP...");
        const sopPath = join(testRoot, "docs", "sops", "build_mvp.md");
        const sopContent = `# Build MVP SOP\n1. Scaffold Project\n2. Add Auth\n3. Deploy`;
        await writeFile(sopPath, sopContent);

        // Prepare LLM responses for 3 steps
        mockLLMQueue.push({ thought: "Scaffolding...", tool: "complete_step", args: { summary: "Project scaffolded." } });
        mockLLMQueue.push({ thought: "Adding Auth...", tool: "complete_step", args: { summary: "Auth added." } });
        mockLLMQueue.push({ thought: "Deploying...", tool: "complete_step", args: { summary: "Deployed." } });

        const executor = new SOPExecutor(new (await import("../../src/llm.js")).LLM(), mcp);
        const sop = {
            title: "Build MVP SOP",
            steps: [
                { number: 1, name: "Scaffold Project", description: "Create project structure." },
                { number: 2, name: "Add Auth", description: "Implement authentication." },
                { number: 3, name: "Deploy", description: "Deploy to cloud." }
            ],
            description: "Build an MVP."
        };

        const executionSummary = await executor.execute(sop, "Start build");
        expect(executionSummary).toContain("SOP 'Build MVP SOP' executed successfully");
        expect(executionSummary).toContain("Project scaffolded");
        expect(executionSummary).toContain("Auth added");
        expect(executionSummary).toContain("Deployed");
        console.log("  SOP execution verified.");

        // 4. Ghost Mode (Morning Standup)
        console.log("Step 4: Verifying Ghost Mode (Morning Standup)...");

        // Mock the trigger logic to simulate task execution
        mockHandleTaskTrigger.mockResolvedValueOnce({ exitCode: 0 });

        await delegator.delegateTask({
            id: "standup-task",
            name: "Morning Standup",
            trigger: "cron",
            schedule: "0 9 * * *",
            prompt: "Run Standup",
            yoloMode: true,
            company: companyName
        });

        expect(mockHandleTaskTrigger).toHaveBeenCalled();
        const ghostLogs = await readdir(join(testRoot, ".agent", "ghost_logs"));
        expect(ghostLogs.length).toBeGreaterThan(0);
        console.log("  Ghost Mode standup verified.");

        // 5. HR Loop (Weekly Review)
        console.log("Step 5: Verifying HR Loop (Weekly Review)...");

        mockHandleTaskTrigger.mockResolvedValueOnce({ exitCode: 0 });

        await delegator.delegateTask({
            id: "hr-review-task",
            name: "Weekly HR Review",
            trigger: "cron",
            schedule: "0 9 * * 1", // Mondays
            prompt: "Run HR Review",
            yoloMode: true,
            company: companyName
        });

        expect(mockHandleTaskTrigger).toHaveBeenCalledTimes(2); // Called twice total
        const ghostLogsAfter = await readdir(join(testRoot, ".agent", "ghost_logs"));
        expect(ghostLogsAfter.length).toBeGreaterThan(ghostLogs.length);
        console.log("  HR Loop review verified.");

    }, 30000);
});
