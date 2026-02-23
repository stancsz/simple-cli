
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
            thought: "Default stress test response.",
            tool: "none",
            args: {},
            message: "Operating nominally."
        };
    }
    if (typeof next === 'function') {
        return await next(system, history);
    }
    return next;
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    // Generate a pseudo-embedding based on text length/hash to allow simple vector search
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
import { mockToolHandlers, mockServerTools, resetMocks, MockMCP, MockMcpServer } from "../integration/test_helpers/mock_mcp_server.js";

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
        if (mockLLMQueue.length > 0 && typeof mockLLMQueue[0] === 'function') {
             const fn = mockLLMQueue.shift();
             await fn(task);
        }
        return { exitCode: 0 };
    },
    killAllChildren: vi.fn()
}));

// --- Real Imports ---
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { HRServer } from "../../src/mcp_servers/hr/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { Scheduler } from "../../src/scheduler.js";
import type { DesktopDriver } from "../../src/mcp_servers/desktop_orchestrator/types.js";

// Mock Driver for Stress Test
class MockStressDriver implements DesktopDriver {
    name: string;
    constructor(name: string) { this.name = name; }
    async init() {}
    async navigate(url: string) {
        if (url.includes("fail")) throw new Error("Simulated Navigation Failure");
        return `Navigated to ${url}`;
    }
    async click() { return ""; }
    async type() { return ""; }
    async screenshot() { return ""; }
    async extract_text() { return ""; }
    async execute_complex_flow() { return ""; }
    async shutdown() {}
}

describe("Multi-Company Production Stress Test (12-Tenant Simulation)", () => {
    let testRoot: string;
    let scheduler: Scheduler;

    // Servers
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let hrServer: HRServer;
    let brainServer: BrainServer;

    // Dynamic import for Desktop Router
    let desktopRouter: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockLLMQueue.length = 0;
        resetMocks();

        // 1. Setup Test Environment
        testRoot = await mkdtemp(join(tmpdir(), "stress-multi-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "metrics"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(testRoot, "logs"), { recursive: true });

        // 2. Initialize Servers
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        hrServer = new HRServer();
        brainServer = new BrainServer();

        // Import Health Monitor dynamically
        await import("../../src/mcp_servers/health_monitor/index.js");

        // Import Desktop Router dynamically and register mock drivers
        const { DesktopRouter } = await import("../../src/mcp_servers/desktop_orchestrator/router.js");
        desktopRouter = new DesktopRouter();
        desktopRouter.registerDriver(new MockStressDriver("stagehand"));
        desktopRouter.registerDriver(new MockStressDriver("anthropic"));

        // 3. Initialize Scheduler
        scheduler = new Scheduler(testRoot);
        await scheduler.start();
    });

    afterEach(async () => {
        await scheduler.stop();
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
        vi.resetModules(); // Reset modules to allow re-importing dynamic modules cleanly if needed
    });

    it("should handle 12 concurrent tenants with chaotic load and strict isolation", async () => {
        const mcp = new MockMCP();
        const companies = Array.from({ length: 12 }, (_, i) => `Company-${i + 1}`);
        const errors: any[] = [];

        // Baseline Memory Check
        if (global.gc) global.gc();
        const startMem = process.memoryUsage().heapUsed;

        console.log(`\n=== STARTING 12-TENANT STRESS TEST ===`);
        console.log(`Start Memory: ${(startMem / 1024 / 1024).toFixed(2)} MB`);

        // 1. Parallel Onboarding (Init Companies)
        console.log(`[Phase 1] Onboarding ${companies.length} companies...`);

        await Promise.all(companies.map(async (company) => {
            const companyDir = join(testRoot, ".agent", "companies", company);
            await mkdir(companyDir, { recursive: true });
            await mkdir(join(companyDir, "docs"), { recursive: true });

            // Create a unique policy doc for isolation check later
            await writeFile(join(companyDir, "docs", "policy.md"), `Policy for ${company}: Confidential`);

            // Register Context
            const client = mcp.getClient("company_context");
            await client.callTool({
                name: "load_company_context",
                arguments: { company_id: company }
            });
        }));

        // 2. Concurrent Operations Loop
        console.log(`[Phase 2] Executing concurrent operations (SOP, Brain, Desktop)...`);

        const operations = companies.map(async (company, index) => {
            const companyClient = mcp.getClient("company_context");
            const brainClient = mcp.getClient("brain");
            const sopClient = mcp.getClient("sop_engine");
            const hrClient = mcp.getClient("hr_loop");
            const healthClient = mcp.getClient("health_monitor");

            try {
                // A. Brain Storage (Unique Memory)
                await brainClient.callTool({
                    name: "brain_store",
                    arguments: {
                        taskId: `task-${company}`,
                        request: `Request from ${company}`,
                        solution: `Solution for ${company}`,
                        company: company
                    }
                });

                // B. SOP Execution (Mocked)
                // We create a mock SOP on the fly if needed, or assume 'standard' SOP exists
                // Let's create a shared SOP first
                if (index === 0) {
                     await writeFile(join(testRoot, "docs", "sops", "deploy.md"), "# Title: Deploy\n1. Build\n2. Push");
                }
                // Wait for file creation
                await new Promise(r => setTimeout(r, 100));

                // Active SOP Check: List SOPs to verify engine responsiveness under load
                await sopClient.callTool({
                    name: "sop_list",
                    arguments: {}
                });

                // Active HR Check: List pending proposals to verify HR Loop responsiveness under load
                await hrClient.callTool({
                    name: "list_pending_proposals",
                    arguments: {}
                });

                // B. Desktop Task (Simulated)
                // Inject Chaos: 20% chance of failure
                const shouldFail = Math.random() < 0.2;
                const url = shouldFail ? "http://internal.site/fail" : `http://internal.site/${company}`;

                try {
                    const driver = await desktopRouter.selectDriver(`Navigate for ${company}`);
                    await driver.navigate(url);
                } catch (e) {
                    // Expected failure for chaos
                    if (!url.includes("fail")) throw e; // Unexpected failure
                }

                // C. Metrics Tracking
                await healthClient.callTool({
                    name: "track_metric",
                    arguments: {
                        agent: `agent-${company}`,
                        metric: "operation_latency",
                        value: Math.floor(Math.random() * 100),
                        tags: { company }
                    }
                });

            } catch (e) {
                console.error(`Error in ${company}:`, e);
                errors.push({ company, error: e });
            }
        });

        await Promise.all(operations);

        console.log(`[Phase 2] Completed. Errors: ${errors.length}`);
        // We expect some errors due to chaos injection (Desktop failures), but not system crashes.
        // We filter out expected chaos errors.
        const unexpectedErrors = errors.filter(e => !e.error.message.includes("Simulated Navigation Failure"));
        expect(unexpectedErrors.length).toBe(0);


        // 3. Verification & Isolation Checks
        console.log(`[Phase 3] Verifying Isolation...`);

        // Check Company 1 vs Company 2
        const company1 = companies[0];
        const company2 = companies[1];

        // Query Brain for Company 1
        const res1 = await mcp.getClient("brain").callTool({
            name: "brain_query",
            arguments: { query: "Solution", company: company1 }
        });
        const content1 = res1.content[0].text;

        expect(content1).toContain(`Solution for ${company1}`);
        expect(content1).not.toContain(`Solution for ${company2}`);

        // Check Metrics Files
        const metricsDir = join(testRoot, ".agent", "metrics");
        const fs = await import("fs/promises");
        const metricFiles = await fs.readdir(metricsDir);
        expect(metricFiles.length).toBeGreaterThan(0);

        // Read a metric file and ensure it contains data
        const metricContent = await fs.readFile(join(metricsDir, metricFiles[0]), 'utf-8');
        expect(metricContent).toContain("operation_latency");

        // Memory Check
        if (global.gc) global.gc();
        const endMem = process.memoryUsage().heapUsed;
        const growth = endMem - startMem;
        const growthMB = growth / 1024 / 1024;

        console.log(`End Memory: ${(endMem / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Memory Growth: ${growthMB.toFixed(2)} MB`);

        // Assert no massive leak (> 200MB for 12 mocked tenants is generous but safe)
        expect(growthMB).toBeLessThan(200);

        console.log(`\n=== STRESS TEST PASSED (12 Tenants Validated) ===`);
    }, 300000); // 300s timeout
});
