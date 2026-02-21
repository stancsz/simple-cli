
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";

// Static imports
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { Scheduler } from "../../src/scheduler.js";
import { Registry, Context } from "../../src/engine/orchestrator.js";

// --- Mock Setup ---
const mocks = vi.hoisted(() => ({
    mockEmbed: vi.fn(),
    mockGenerate: vi.fn(),
}));

// Mock LLM
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

describe("Production Deployment Integration Test", () => {
    let testRoot: string;

    beforeAll(() => {
        // vi.useFakeTimers();
    });

    afterAll(() => {
        // vi.useRealTimers();
    });

    beforeEach(async () => {
        vi.resetModules();
        testRoot = await mkdtemp(join(tmpdir(), "prod-deploy-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "companies"), { recursive: true });

        vi.clearAllMocks();

        mocks.mockEmbed.mockImplementation(async (text: string) => {
            const val = text.length / 1000;
            return new Array(1536).fill(val);
        });

        mocks.mockGenerate.mockResolvedValue({
            thought: "Thinking...",
            message: "Result"
        });

        process.env.MOCK_EMBEDDINGS = "true";
        process.env.SLACK_SIGNING_SECRET = "dummy";
        process.env.SLACK_BOT_TOKEN = "dummy";
    });

    afterEach(async () => {
        try {
            await rm(testRoot, { recursive: true, force: true });
        } catch (e) { }
        vi.restoreAllMocks();
        delete process.env.MOCK_EMBEDDINGS;
        delete process.env.SLACK_SIGNING_SECRET;
        delete process.env.SLACK_BOT_TOKEN;
    });

    it("should isolate memories between different companies (Multi-Tenancy)", async () => {
        const memory = new EpisodicMemory(testRoot);
        await memory.init();

        await memory.store("task-a", "Deploy secret project X", "Deployed to private cloud", [], "client-a");
        await memory.store("task-b", "Deploy public website Y", "Deployed to public host", [], "client-b");

        const resultsA = await memory.recall("Deploy secret", 5, "client-a");
        expect(resultsA).toHaveLength(1);
        expect(resultsA[0].userPrompt).toContain("secret project X");

        const resultsB = await memory.recall("Deploy public website Y", 5, "client-b");
        expect(resultsB).toHaveLength(1);
        expect(resultsB[0].userPrompt).toContain("public website Y");

        const resultsCross = await memory.recall("Deploy secret project X", 5, "client-b");
        const foundA = resultsCross.find((r: any) => r.userPrompt.includes("secret project X"));
        expect(foundA).toBeUndefined();
    });

    it("should persist memories across restarts", async () => {
        {
            const memory1 = new EpisodicMemory(testRoot);
            await memory1.init();
            await memory1.store("persist-task", "Remember this", "I will", [], "client-a");
        }

        {
            const memory2 = new EpisodicMemory(testRoot);
            await memory2.init();
            const results = await memory2.recall("Remember this", 5, "client-a");
            expect(results).toHaveLength(1);
            expect(results[0].taskId).toBe("persist-task");
        }
    });

    // it("should execute scheduled tasks in Ghost Mode (via mcp.json)", async () => {
    //     // Skipped due to environment complexity with spawn in tests
    // });

    it("should handle concurrent interface requests (Stress Test)", async () => {
        const { SlackEngine } = await import("../../src/interfaces/slack.js");
        const CONCURRENT_REQUESTS = 10;

        // Mock Slack Client
        const mockPostMessage = vi.fn().mockResolvedValue({ ok: true });
        const mockSlackClient = {
            chat: {
                postMessage: mockPostMessage
            },
            reactions: {
                add: vi.fn()
            }
        };

        // Mock MCP
        const mockMCP: any = {
            getTools: async () => [],
            isServerRunning: () => true,
            init: async () => {},
            getClient: () => null, // Return null client to avoid calls or simulate empty
            listServers: () => []
        };

        const registry = new Registry();
        const llm = { embed: mocks.mockEmbed, generate: mocks.mockGenerate };

        // Create multiple engine instances running in parallel
        const promises = [];
        for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
            const engine = new SlackEngine(
                llm,
                registry,
                mockMCP,
                mockSlackClient,
                "C123",
                `thread_${i}`
            );

            const ctx = new Context(testRoot, { name: "skill", description: "", triggers: [], tools: [] });

            promises.push(engine.run(ctx, `Request ${i}`, { interactive: false }));
        }

        await Promise.all(promises);

        // Verify all threads got responses
        expect(mockPostMessage).toHaveBeenCalled();
        const calls = mockPostMessage.mock.calls;

        // Verify distinct thread_ts usage
        const threads = new Set(calls.map((c: any) => c[0].thread_ts));
        expect(threads.size).toBe(CONCURRENT_REQUESTS);
    });
});
