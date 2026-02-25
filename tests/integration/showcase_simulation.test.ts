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
    if (typeof next === 'object' && next.thought) return next; // Return structured response
    return { thought: "Generated response", tool: "none", args: {}, message: JSON.stringify(next) }; // Default to stringify if simple object
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

// Mock Episodic Memory to avoid DB
const mockEpisodic = {
    recall: vi.fn().mockResolvedValue([]),
    store: vi.fn().mockResolvedValue(undefined),
    getRecentEpisodes: vi.fn().mockResolvedValue([])
};

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn(() => mockEpisodic)
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

// Real Classes/Functions
import { JobDelegator } from "../../src/scheduler/job_delegator.js";
import { CompanyContextServer } from "../../src/mcp_servers/company_context.js";
import { SOPEngineServer } from "../../src/mcp_servers/sop_engine/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { healShowcase } from "../../src/mcp_servers/showcase_healer/healer.js";

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

        // Reset episodic mocks
        mockEpisodic.recall.mockResolvedValue([]);
        mockEpisodic.store.mockResolvedValue(undefined);
        mockEpisodic.getRecentEpisodes.mockResolvedValue([]);

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
        const companyId = "showcase-corp";
        const companyDir = join(testRoot, ".agent", "companies", companyId);
        await mkdir(companyDir, { recursive: true });
        await writeFile(join(companyDir, "context.json"), JSON.stringify({ name: "Showcase Corp" }));

        // 2. Setup SOP
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
        mockLLMQueue.push(async (task: any) => {
             // console.log(`[Mock] Executing task: ${task.name}`);
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
             // console.log(`[Mock] Executing task: ${task.name}`);
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

        const logs2 = await readdir(join(testRoot, ".agent", "ghost_logs"));
        expect(logs2.length).toBe(2);
    });

    it("should activate self-healing loop on failure", async () => {
        // Mock the MCP adapter passed to healShowcase
        const mockMcpAdapter = {
            callTool: vi.fn().mockImplementation(async (server, tool, args) => {
                if (server === "health_monitor" && tool === "get_latest_showcase_run") {
                    return {
                        content: [{
                            text: JSON.stringify({
                                id: "failed-run-123",
                                success: false,
                                timestamp: new Date().toISOString(),
                                error: "Network timeout during SOP execution",
                                steps: []
                            })
                        }]
                    };
                }
                if (server === "sop_engine" && tool === "sop_execute") {
                    return { content: [{ text: "SOP Retry Successful" }] };
                }
                return { content: [{ text: "Mock response" }] };
            })
        };

        // Prepare LLM to decide "retry_sop"
        mockLLMQueue.push({
             action: "retry_sop",
             reason: "Transient network error detected",
             sop_name: "showcase_sop"
        });

        // Call Healer
        const result = await healShowcase({
            mcp: mockMcpAdapter as any,
            llm: { generate: mockGenerate } as any,
            episodic: mockEpisodic as any
        });

        expect(result).toContain("Healed: retry_sop");
        expect(result).toContain("Executed retry for showcase_sop");

        // Verify Tool Calls
        expect(mockMcpAdapter.callTool).toHaveBeenCalledWith("health_monitor", "get_latest_showcase_run", {});
        expect(mockMcpAdapter.callTool).toHaveBeenCalledWith("sop_engine", "sop_execute", {
            name: "showcase_sop",
            input: "Healer retry"
        });

        // Verify Episode Logged
        expect(mockEpisodic.store).toHaveBeenCalledWith(
            expect.stringContaining("heal_showcase_failed-run-123"),
            "Heal showcase failure",
            expect.stringContaining("Action: retry_sop"),
            expect.any(Array),
            undefined, undefined, undefined, undefined, undefined, undefined, undefined,
            "showcase_healing_episode",
            "failed-run-123"
        );
    });
});
