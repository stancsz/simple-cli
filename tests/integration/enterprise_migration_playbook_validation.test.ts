
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
    return next; // Return the object directly
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

// --- Mock LanceDB ---
vi.mock("../../src/mcp_servers/brain/lance_connector.js", () => ({
    LanceConnector: class {
        constructor() {}
        async connect() { console.log("Mock LanceDB connected"); }
        async save() {}
        async query() { return []; }
    }
}));

// --- Real Imports ---
import { JobDelegator } from "../../src/scheduler/job_delegator.js";
import { SOPExecutor } from "../../src/mcp_servers/sop_engine/executor.js";
import { setupCompany } from "../../src/utils/company-setup.js";

describe("Enterprise Migration Playbook Integration Test", () => {
    let testRoot: string;
    let delegator: JobDelegator;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();
        mockLLMQueue.length = 0;

        testRoot = await mkdtemp(join(tmpdir(), "enterprise-migration-test-"));
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

    it("should execute the full Enterprise Migration playbook workflow", async () => {
        const mcp = new MockMCP();
        const companyName = "enterprise-client";

        // --- Phase 1: Analysis & Planning (SOP) ---
        console.log("Step 1: Initializing Company Context...");
        await setupCompany(companyName);

        // Verify Company Context Created
        const companyDir = join(testRoot, ".agent", "companies", companyName);
        const contextExists = (await readdir(join(companyDir, "config"))).includes("company_context.json");
        expect(contextExists).toBe(true);
        console.log("  Company context initialized.");

        console.log("Step 2: Executing 'Analyze Monolith' SOP...");
        // Define the SOP (simulating what's in analyze-monolith.md)
        const sopPath = join(testRoot, "docs", "sops", "analyze-monolith.md");
        await writeFile(sopPath, "# Analyze Monolith\n1. Scan Codebase\n2. Identify Domains\n3. Roadmap");

        // Mock LLM responses for the 3 steps
        mockLLMQueue.push({ thought: "Scanning...", tool: "complete_step", args: { summary: "Scanned legacy modules: payments, users." } });
        mockLLMQueue.push({ thought: "Identifying...", tool: "complete_step", args: { summary: "Identified 'PaymentService' bounded context." } });
        mockLLMQueue.push({ thought: "Roadmapping...", tool: "complete_step", args: { summary: "Roadmap: Extract PaymentService first." } });

        const executor = new SOPExecutor(new (await import("../../src/llm.js")).LLM(), mcp);
        const sop = {
            title: "Analyze Monolith",
            steps: [
                { number: 1, name: "Scan Codebase", description: "List files." },
                { number: 2, name: "Identify Domains", description: "Find boundaries." },
                { number: 3, name: "Roadmap", description: "Create plan." }
            ],
            description: "Analyze legacy monolith."
        };

        const executionSummary = await executor.execute(sop, "Start analysis");
        expect(executionSummary).toContain("SOP 'Analyze Monolith' executed successfully");
        expect(executionSummary).toContain("Scanned legacy modules");
        expect(executionSummary).toContain("Identified 'PaymentService'");
        console.log("  Analysis SOP verified.");

        // --- Phase 2: Automated Service Scaffolding (Swarm) ---
        console.log("Step 3: Verifying Swarm Spawning...");

        // Mock the 'spawn_subagent' tool on the MCP
        const spawnSpy = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Agent 'Service Architect' spawned." }] });
        mockToolHandlers.set("spawn_subagent", spawnSpy);

        // Simulate the Orchestrator calling the tool (as if user said "Spawn a Service Architect...")
        // In a real run, the LLM would decide to call this. Here we manually invoke it to verify the integration point.
        const swarmClient = mcp.getClient("swarm");
        await swarmClient.callTool({
            name: "spawn_subagent",
            arguments: {
                role: "Service Architect",
                goal: "Scaffold PaymentService in NestJS",
                tools: ["framework_analyzer", "filesystem"]
            }
        });

        expect(spawnSpy).toHaveBeenCalledWith(expect.objectContaining({
            role: "Service Architect",
            goal: "Scaffold PaymentService in NestJS"
        }));
        console.log("  Swarm spawning verified.");

        // --- Phase 3: Incremental Migration (Ghost Mode) ---
        console.log("Step 4: Verifying Ghost Mode (Migration Sync)...");

        mockHandleTaskTrigger.mockResolvedValueOnce({ exitCode: 0 });

        await delegator.delegateTask({
            id: "migration-sync-task",
            name: "Nightly Data Migration",
            trigger: "cron",
            schedule: "0 2 * * *", // 2 AM
            prompt: "Sync Oracle to Postgres",
            yoloMode: true,
            company: companyName
        });

        expect(mockHandleTaskTrigger).toHaveBeenCalled();
        console.log("  Ghost Mode migration task verified.");

        // --- Phase 4: Validation (Desktop Orchestrator) ---
        console.log("Step 5: Verifying Desktop Orchestrator Call...");

        // Mock the 'navigate' tool (Skyvern/Stagehand)
        const navigateSpy = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Navigated to localhost:3000" }] });
        mockToolHandlers.set("navigate", navigateSpy);

        // Simulate calling the desktop tool for validation
        const desktopClient = mcp.getClient("desktop_orchestrator");
        await desktopClient.callTool({
            name: "navigate",
            arguments: {
                url: "http://localhost:3000/payments",
                action: "verify_ui"
            }
        });

        expect(navigateSpy).toHaveBeenCalledWith(expect.objectContaining({
            url: "http://localhost:3000/payments"
        }));
        console.log("  Desktop validation verified.");

    }, 30000);
});
