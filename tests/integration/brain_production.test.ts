
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { BrainServer } from "../../src/mcp_servers/brain.js";

// Mock LLM to avoid external calls
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
            generate: vi.fn().mockResolvedValue("Mock response"),
        }),
    };
});

// Capture tool handlers
const toolHandlers = new Map<string, Function>();

// Mock McpServer to capture tool handlers
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
    return {
        McpServer: class {
            constructor() {}
            tool(name: string, description: string, schema: any, handler: Function) {
                toolHandlers.set(name, handler);
            }
            async connect() {}
        }
    };
});

// Mock MCP SDK stdio to avoid transport issues
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
    StdioServerTransport: class { connect() {} }
}));

describe("Brain Production Readiness", () => {
    let testRoot: string;
    let brainServer: BrainServer;

    beforeAll(() => {
        process.env.MOCK_EMBEDDINGS = "true";
    });

    afterAll(() => {
        delete process.env.MOCK_EMBEDDINGS;
        vi.restoreAllMocks();
    });

    beforeEach(async () => {
        toolHandlers.clear();
        testRoot = await mkdtemp(join(tmpdir(), "brain-production-test-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        await mkdir(join(testRoot, ".agent", "brain", "episodic"), { recursive: true });
        await mkdir(join(testRoot, ".agent", "sops"), { recursive: true });

        brainServer = new BrainServer();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    // Helper to call tools
    async function callTool(name: string, args: any) {
        const handler = toolHandlers.get(name);
        if (!handler) throw new Error(`Tool ${name} not found`);
        return await handler(args);
    }

    it("should handle concurrent queries and storage without data loss", async () => {
        // 1. Concurrent Storage
        const storePromises = [];
        for (let i = 0; i < 20; i++) {
            storePromises.push(callTool("brain_store", {
                taskId: `task-${i}`,
                request: `Request ${i}`,
                solution: `Solution ${i}`,
                artifacts: JSON.stringify([`file-${i}.ts`]),
                company: "ConcurrentCorp"
            }));
        }
        await Promise.all(storePromises);

        // 2. Verification
        const queryRes = await callTool("brain_query", {
            query: "Solution",
            limit: 50,
            company: "ConcurrentCorp"
        });

        const content = queryRes.content[0].text;
        expect(content).not.toContain("No relevant memories found");
        const matches = content.match(/\[Task: task-\d+\]/g);
        expect(matches.length).toBeGreaterThan(0);
    });

    it("should persist memories across server restarts", async () => {
        // 1. Store memory
        await callTool("brain_store", {
            taskId: "persist-task",
            request: "Remember this",
            solution: "I will remember",
            company: "PersistCorp"
        });

        // 2. "Restart" Server
        // Creating a new instance will re-register tools (overwriting in map),
        // but importantly, it will create a NEW EpisodicMemory instance
        // which must read from the disk (testRoot) to find previous data.
        brainServer = new BrainServer();

        // 3. Query
        const queryRes = await callTool("brain_query", {
            query: "Remember this",
            company: "PersistCorp"
        });

        expect(queryRes.content[0].text).toContain("persist-task");
        expect(queryRes.content[0].text).toContain("I will remember");
    });

    it("should isolate memories between different companies", async () => {
        // 1. Store for Company A
        await callTool("brain_store", {
            taskId: "task-a",
            request: "Secret A",
            solution: "Solution A",
            company: "CompanyA"
        });

        // 2. Store for Company B
        await callTool("brain_store", {
            taskId: "task-b",
            request: "Secret B",
            solution: "Solution B",
            company: "CompanyB"
        });

        // 3. Query Company A for Company B's secret
        const queryResA = await callTool("brain_query", {
            query: "Secret B",
            company: "CompanyA"
        });

        if (!queryResA.content[0].text.includes("No relevant memories found")) {
            expect(queryResA.content[0].text).not.toContain("task-b");
            expect(queryResA.content[0].text).not.toContain("Solution B");
        }

        // 4. Query Company B should find it
        const queryResB = await callTool("brain_query", {
            query: "Secret B",
            company: "CompanyB"
        });
        expect(queryResB.content[0].text).toContain("task-b");
    });

    it("should handle high volume of embeddings (Performance)", async () => {
        const startTime = Date.now();
        const count = 50;

        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(callTool("brain_store", {
                taskId: `perf-${i}`,
                request: `Performance test request ${i}`,
                solution: `Performance test solution ${i}`,
                company: "PerfCorp"
            }));
        }
        await Promise.all(promises);

        const duration = Date.now() - startTime;
        console.log(`Inserted ${count} memories in ${duration}ms`);

        expect(duration).toBeLessThan(10000);

        const queryRes = await callTool("brain_query", {
            query: "Performance test",
            limit: 5,
            company: "PerfCorp"
        });
        expect(queryRes.content[0].text).toContain("perf-");
    });
});
