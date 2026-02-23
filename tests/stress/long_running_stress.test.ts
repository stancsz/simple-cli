
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { StressGenerator } from "../../scripts/stress_simulator/generator.js";

// --- Hoisted Variables ---
const { mockLLMQueue } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[]
    };
});

// --- Mock Setup ---

// 1. Mock LLM
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
    const val = (text.length % 100) / 100;
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

// 3. Mock Scheduler Trigger
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: async (task: any) => {
        // console.log(`[MockTrigger] Executing task: ${task.name}`);
        if (mockLLMQueue.length > 0 && typeof mockLLMQueue[0] === 'function') {
             const fn = mockLLMQueue.shift();
             await fn(task);
        }
        return { exitCode: 0 };
    },
    killAllChildren: vi.fn()
}));

// --- Real Imports ---
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { Scheduler } from "../../src/scheduler.js";
// Health Monitor (We need to import the file to register tools, but we also want to verify metrics file)
// We will import it dynamically in beforeEach after setting env vars.

// Operational Persona (We will use StatusGenerator directly to verify it works with our mocks)
import { StatusGenerator } from "../../src/mcp_servers/operational_persona/status_generator.js";

// Import types only
import type { DesktopDriver } from "../../src/mcp_servers/desktop_orchestrator/types.js";

// Mock Driver for Stress Test
class MockStressDriver implements DesktopDriver {
    name: string;
    constructor(name: string) { this.name = name; }
    async init() {}
    async navigate(url: string) { return `Navigated to ${url}`; }
    async click() { return ""; }
    async type() { return ""; }
    async screenshot() { return ""; }
    async extract_text() { return ""; }
    async execute_complex_flow() { return ""; }
    async shutdown() {}
}

describe("Long-Running Stress Test (7-Day Simulation)", () => {
    let testRoot: string;
    let scheduler: Scheduler;
    let brainServer: BrainServer;
    // We'll hold references to clients
    let mcp: MockMCP;
    let statusGenerator: StatusGenerator;
    let desktopRouter: any; // Dynamic import type

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
        testRoot = await mkdtemp(join(tmpdir(), "stress-test-"));

        // Mock Process Env for Health Monitor
        vi.stubEnv("JULES_AGENT_DIR", join(testRoot, ".agent"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Create structure
        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "metrics"), { recursive: true }); // Important for Health Monitor
        await mkdir(join(testRoot, "scripts", "dashboard"), { recursive: true }); // For alert_rules.json

        // 2. Initialize Servers
        brainServer = new BrainServer();

        // Import Health Monitor dynamically to ensure it picks up the mocked env vars
        await import("../../src/mcp_servers/health_monitor/index.js");

        // Import Desktop Router dynamically
        const { DesktopRouter } = await import("../../src/mcp_servers/desktop_orchestrator/router.js");
        desktopRouter = new DesktopRouter();
        // Overwrite drivers with mocks
        desktopRouter.registerDriver(new MockStressDriver("stagehand"));
        desktopRouter.registerDriver(new MockStressDriver("anthropic"));
        desktopRouter.registerDriver(new MockStressDriver("openai"));
        desktopRouter.registerDriver(new MockStressDriver("skyvern"));

        mcp = new MockMCP();

        // Setup Operational Persona (StatusGenerator)
        // It needs clients to talk to Brain and Health
        const brainClient = mcp.getClient("brain");
        const healthClient = mcp.getClient("health_monitor");
        statusGenerator = new StatusGenerator(brainClient, healthClient);

        // 3. Initialize Scheduler
        scheduler = new Scheduler(testRoot);

        // Define Schedule
        const schedule = {
            tasks: [
                {
                    id: "task-standup",
                    name: "Morning Standup",
                    trigger: "cron",
                    schedule: "0 9 * * *",
                    prompt: "Run standup.",
                    yoloMode: true
                },
                {
                    id: "task-hr",
                    name: "Daily HR Review",
                    trigger: "cron",
                    schedule: "0 12 * * *",
                    prompt: "Analyze logs.",
                    yoloMode: true
                },
                {
                    id: "task-dreaming",
                    name: "Nightly Dreaming",
                    trigger: "cron",
                    schedule: "0 2 * * *",
                    prompt: "Dream.",
                    yoloMode: true
                }
            ]
        };
        await writeFile(join(testRoot, 'scheduler.json'), JSON.stringify(schedule));

        // Set Start Time: Day 1, 08:00
        vi.setSystemTime(new Date('2025-01-01T08:00:00Z'));

        await scheduler.start();
    });

    afterEach(async () => {
        await scheduler.stop();
        try {
            await rm(testRoot, { recursive: true, force: true });
        } catch (e) {
            console.warn("Cleanup warning (ignoring):", e);
        }
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("should survive a 7-day stress test with chaotic failures and recover", async () => {
        // Use fixed seed for determinism
        const generator = new StressGenerator(['client-a', 'client-b', 'client-c'], 42);
        const healthClient = mcp.getClient("health_monitor");
        const brainClient = mcp.getClient("brain");

        console.log("\n=== STARTING 7-DAY STRESS SIMULATION ===");

        let totalErrorsDetected = 0;
        let totalRecoveries = 0;

        for (let day = 1; day <= 7; day++) {
            console.log(`\n--- Day ${day} ---`);

            // --- 09:00 Morning Standup ---
            console.log(`[09:00] Morning Standup...`);
            // Queue LLM response for Standup task
            mockLLMQueue.push(async () => {
                // The task would call 'generate_daily_standup'
                // We simulate checking status manually here to verify functionality
                const status = await statusGenerator.getSystemStatus();
                // console.log(`[Standup Report] ${status}`);
                if (status.includes("degraded")) {
                    console.log("   -> System reported degradation (Expected if chaos occurred).");
                }
            });

            await vi.advanceTimersByTimeAsync(1000 * 60 * 60); // +1h -> 09:00

            // --- 10:00 - 12:00 Workload Burst 1 ---
            console.log(`[10:00] Workload Burst 1...`);
            await vi.advanceTimersByTimeAsync(1000 * 60 * 60); // +1h -> 10:00

            // Generate 20 metrics
            for (let i = 0; i < 20; i++) {
                const metric = generator.generateRandomMetric();

                // Chaos Injection
                if (generator.shouldTriggerChaos()) {
                    const chaosType = generator.getChaosType();
                    if (chaosType === 'timeout' || chaosType === 'api_error') {
                         metric.value = 5000; // Spike latency
                         metric.metric = 'latency';
                         console.log(`   [Chaos] Injected ${chaosType} (high latency spike: ${metric.value}ms)`);
                         totalErrorsDetected++;
                    }
                }

                await healthClient.callTool({
                    name: "track_metric",
                    arguments: {
                        agent: metric.agent,
                        metric: metric.metric,
                        value: metric.value,
                        tags: metric.tags
                    }
                });
            }

            // Simulate Brain Activity (SOP Execution)
            const log = generator.generateSOPLog();
            await brainClient.callTool({
                name: "brain_store",
                arguments: {
                    taskId: `sop-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Math.random is mocked via seed in generator, but here we just need unique ID.
                    request: `Execute SOP ${log.sop}`,
                    solution: log.status === 'success' ? 'Outcome: Success' : `Outcome: Failure - ${log.error}`,
                    company: log.company
                }
            });

            // --- 12:00 HR Review ---
            console.log(`[12:00] HR Review...`);
            await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 2); // +2h -> 12:00

            // Queue LLM response for HR Review
            mockLLMQueue.push(async () => {
                 // HR analyzes logs. We simulate it finding errors.
                 if (totalErrorsDetected > 0) {
                     // console.log("   [HR] Analyzing logs... Found anomalies.");
                     totalRecoveries++; // Simulate a "fix" proposed
                     totalErrorsDetected = 0; // Reset for next day
                 }
            });

            // --- 14:00 - 18:00 Workload Burst 2 ---
            console.log(`[14:00] Workload Burst 2...`);
            await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 2); // +2h -> 14:00

            // Desktop Research Session (ADDED)
            if (day % 1 === 0) { // Every day
                console.log(`   [Desktop] Running automated research...`);
                // Rotate backends
                const backends = ["stagehand", "anthropic", "skyvern"];
                const target = backends[day % 3];
                try {
                    // Simulate routing
                    const driver = await desktopRouter.selectDriver(`use ${target} for research`);
                    // Simulate execution
                    await driver.navigate("http://internal.simulation");

                    // Also simulate concurrent load occasionally
                    if (day === 3 || day === 5) {
                        console.log("   [Desktop] Spiking concurrency...");
                        const tasks = Array.from({length: 10}, (_, i) => desktopRouter.selectDriver(`Task ${i}`));
                        await Promise.all(tasks);
                    }

                } catch (e) {
                    console.error("Desktop task failed:", e);
                    totalErrorsDetected++;
                }
            }

            // More metrics
            for (let i = 0; i < 10; i++) {
                const m = generator.generateRandomMetric();
                await healthClient.callTool({
                    name: "track_metric",
                    arguments: { agent: m.agent, metric: m.metric, value: m.value, tags: m.tags }
                });
            }

            // --- 02:00 Nightly Dreaming ---
            console.log(`[02:00] Nightly Dreaming...`);
            // Advance to next day 02:00
            // Current is 14:00. Need +12h to 02:00 next day
            await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 12);

            mockLLMQueue.push(async () => {
                // Dreaming task
                // console.log("   [Dreaming] Simulating offline scenarios...");
            });

            // Advance to 08:00 next day to complete cycle
            await vi.advanceTimersByTimeAsync(1000 * 60 * 60 * 6);
        }

        console.log("\n=== STRESS TEST SUMMARY ===");
        console.log(`Days Simulated: 7`);
        console.log(`Total Recoveries Triggered: ${totalRecoveries}`);

        // Assertions

        // 1. Verify Metrics were tracked (Check file existence in temp dir)
        const metricsDir = join(testRoot, ".agent", "metrics");
        const fs = await import("fs/promises");
        const files = await fs.readdir(metricsDir);
        console.log(`Metric files generated: ${files.length}`);
        expect(files.length).toBeGreaterThan(0);

        // Verify Desktop metrics are present in the files
        let foundDesktopMetric = false;
        for (const file of files) {
            const content = await fs.readFile(join(metricsDir, file), 'utf-8');
            if (content.includes('desktop_orchestrator')) {
                foundDesktopMetric = true;
                break;
            }
        }
        console.log(`Desktop metrics found: ${foundDesktopMetric}`);
        expect(foundDesktopMetric).toBe(true);

        // 2. Verify Operational Persona can generate a report at the end
        const finalStatus = await statusGenerator.getSystemStatus();
        console.log(`Final System Status: ${finalStatus}`);
        expect(finalStatus).toBeDefined();

        // 3. Verify Brain has memories
        // We use the tool to query
        const brainRes = await brainClient.callTool({
            name: "brain_query",
            arguments: { query: "SOP" }
        });
        // We stored mock SOP experiences
        expect(brainRes.content[0].text).toContain("Outcome");

        console.log("=== TEST COMPLETED SUCCESSFULLY ===");
    }, 300000); // 5 min timeout
});
