import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readdir } from "fs/promises";
import { tmpdir } from "os";

// --- Hoisted Mocks ---
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

// Mock MCP
import { mockToolHandlers, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({ MCP: MockMCP }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({ McpServer: MockMcpServer }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class { connect() {} } }));

// Mock Trigger
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: async (task: any) => {
        if (mockLLMQueue.length > 0 && typeof mockLLMQueue[0] === 'function') {
             const fn = mockLLMQueue.shift();
             await fn(task);
        }
        return { exitCode: 0 };
    },
    killAllChildren: vi.fn()
}));

// Real Classes
import { JobDelegator } from "../../src/scheduler/job_delegator.js";
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";

describe("Showcase Simulation Integration Test", () => {
    let testRoot: string;
    let delegator: JobDelegator;
    let companyServer: CompanyContextServer;
    let sopServer: SOPEngineServer;
    let brainServer: BrainServer;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();
        mockLLMQueue.length = 0;

        testRoot = await mkdtemp(join(tmpdir(), "showcase-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Setup Agent Dir structure mimicking the Showcase layout
        const agentDir = join(testRoot, ".agent");
        await mkdir(join(agentDir, "companies"), { recursive: true });
        await mkdir(join(testRoot, "docs", "sops"), { recursive: true });
        await mkdir(join(agentDir, "ghost_logs"), { recursive: true });

        // Initialize Servers (which registers tools to the MockMCP)
        companyServer = new CompanyContextServer();
        sopServer = new SOPEngineServer();
        brainServer = new BrainServer();

        delegator = new JobDelegator(agentDir);
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
    });

    it("should execute the full Showcase scenario: Context, SOP, Ghost Mode, HR Loop", async () => {
        const mcp = new MockMCP();

        // 1. Setup Company Context
        // In the real demo, we manually place the context file or assume it's loaded.
        // Here we simulate the state where the company is ready.
        const companyId = "showcase-corp";
        const companyDir = join(testRoot, ".agent", "companies", companyId);
        await mkdir(companyDir, { recursive: true });
        await writeFile(join(companyDir, "context.json"), JSON.stringify({ name: "Showcase Corp" }));

        // 2. Setup SOP
        // In the demo, this file is in demos/simple-cli-showcase/docs/showcase_sop.md
        // We put it in the test root docs/sops/
        const sopContent = `# Showcase SOP\n1. Initialize Project\n2. Deploy`;
        await writeFile(join(testRoot, "docs", "sops", "showcase_sop.md"), sopContent);

        // 3. Execute SOP via SOP Engine
        // Prepare LLM responses for SOP steps
        // Step 1
        mockLLMQueue.push({
            thought: "Initializing project...",
            tool: "complete_step",
            args: { summary: "Project initialized." }
        });
        // Step 2
        mockLLMQueue.push({
            thought: "Deploying...",
            tool: "complete_step",
            args: { summary: "Deployed successfully." }
        });

        const sopClient = mcp.getClient("sop_engine");
        const sopRes = await sopClient.callTool({
            name: "sop_execute",
            arguments: { name: "showcase_sop", input: "Start simulation" }
        });

        expect(sopRes.content[0].text).toContain("SOP 'Showcase SOP' executed successfully");

        // 4. Ghost Mode Task (Morning Standup)
        // We simulate the trigger logic
        mockLLMQueue.push(async (task: any) => {
             console.log(`[Mock] Executing task: ${task.name}`);
        });

        await delegator.delegateTask({
            id: "standup",
            name: "Morning Standup",
            trigger: "cron",
            schedule: "0 9 * * *",
            prompt: "Run Standup",
            yoloMode: true,
            company: companyId
        });

        // Verify ghost_logs for Standup
        const logs = await readdir(join(testRoot, ".agent", "ghost_logs"));
        expect(logs.length).toBe(1);

        // 5. HR Loop (Daily Review)
        mockLLMQueue.push(async (task: any) => {
             console.log(`[Mock] Executing task: ${task.name}`);
        });

        await delegator.delegateTask({
            id: "hr-review",
            name: "Daily HR Review",
            trigger: "cron",
            schedule: "0 18 * * *",
            prompt: "Run HR Review",
            yoloMode: true,
            company: companyId
        });

        // Verify ghost_logs for HR Review
        const logs2 = await readdir(join(testRoot, ".agent", "ghost_logs"));
        expect(logs2.length).toBe(2);
    });
});
