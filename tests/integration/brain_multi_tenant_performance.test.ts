import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { SemanticGraph } from "../../src/brain/semantic_graph.js";
import { join } from "path";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { FrameworkIngestionEngine } from "../../src/framework_ingestion/ingest.js";

const TEST_DIR = join(process.cwd(), "test_brain_perf");

const mockLLM = {
    embed: async (text: string) => {
        return new Array(1536).fill(0.1);
    }
} as any;

describe("Brain Multi-Tenant Performance & Framework Integration", () => {

    beforeEach(async () => {
        if (existsSync(TEST_DIR)) {
            await rm(TEST_DIR, { recursive: true, force: true });
        }
        process.env.MOCK_EMBEDDINGS = "true";
        process.env.BRAIN_STORAGE_ROOT = ""; // Ensure we use test dir base
    });

    afterEach(async () => {
        if (existsSync(TEST_DIR)) {
            await rm(TEST_DIR, { recursive: true, force: true });
        }
    });

    it("should strictly isolate memory between tenants", async () => {
        const memory = new EpisodicMemory(TEST_DIR, mockLLM);
        const companyA = "tenant_a";
        const companyB = "tenant_b";

        await memory.store("task1", "req1", "sol1", [], companyA);
        await memory.store("task2", "req2", "sol2", [], companyB);

        const resA = await memory.recall("req1", 10, companyA);
        expect(resA.length).toBe(1);
        expect(resA[0].taskId).toBe("task1");

        const resB = await memory.recall("req2", 10, companyB);
        expect(resB.length).toBe(1);
        expect(resB[0].taskId).toBe("task2");

        // Cross check
        const resA_cross = await memory.recall("req2", 10, companyA);
        const hasTask2 = resA_cross.some(r => r.taskId === "task2");
        expect(hasTask2).toBe(false);
    });

    it("should prevent path traversal in company name", async () => {
        const memory = new EpisodicMemory(TEST_DIR, mockLLM);
        const maliciousCompany = "../../../etc/passwd";

        await expect(
            memory.store("task1", "req", "sol", [], maliciousCompany)
        ).rejects.toThrow(/Invalid company name/);
    });

    it("should strictly isolate semantic graph between tenants", async () => {
        const graph = new SemanticGraph(TEST_DIR);
        const companyA = "tenant_a";
        const companyB = "tenant_b";

        await graph.addNode("nodeA", "test", {}, companyA);
        await graph.addNode("nodeB", "test", {}, companyB);

        const dataA = await graph.getGraphData(companyA);
        const dataB = await graph.getGraphData(companyB);

        expect(dataA.nodes.find(n => n.id === "nodeA")).toBeDefined();
        expect(dataA.nodes.find(n => n.id === "nodeB")).toBeUndefined();

        expect(dataB.nodes.find(n => n.id === "nodeB")).toBeDefined();
        expect(dataB.nodes.find(n => n.id === "nodeA")).toBeUndefined();
    });

    it("should auto-register frameworks with default policies", async () => {
        const engine = new FrameworkIngestionEngine(process.cwd());

        // Create a fake framework dir
        const fakeFwDir = join(process.cwd(), "src", "mcp_servers", "test_framework");
        if (!existsSync(fakeFwDir)) {
             await mkdir(fakeFwDir, { recursive: true });
        }

        try {
            const config = await engine.registerFramework("test_framework");
            expect(config).toBeDefined();
            expect(config?.name).toBe("test_framework");
            expect(config?.memoryPolicy.access).toBe("read-write");

            const discovered = await engine.scanForFrameworks();
            const found = discovered.find(d => d.name === "test_framework");
            expect(found).toBeDefined();
        } finally {
            if (existsSync(fakeFwDir)) {
               await rm(fakeFwDir, { recursive: true, force: true });
            }
        }
    });

    it("should meet performance benchmarks (simplified)", async () => {
        const memory = new EpisodicMemory(TEST_DIR, mockLLM);
        const NUM_EPS = 100;
        const CONCURRENT = 20;

        // Ingest
        const promises = [];
        for (let i = 0; i < NUM_EPS; i++) {
            promises.push(memory.store(`t${i}`, `req${i}`, `sol${i}`, [], "perf_test"));
        }
        await Promise.all(promises);

        // Query
        const start = Date.now();
        const queries = [];
        for (let i = 0; i < CONCURRENT; i++) {
            queries.push(memory.recall("req", 5, "perf_test"));
        }
        await Promise.all(queries);
        const duration = Date.now() - start;

        const avgLatency = duration / CONCURRENT;
        console.log(`Test Avg Latency: ${avgLatency}ms`);

        expect(avgLatency).toBeLessThan(500);
    });
});
