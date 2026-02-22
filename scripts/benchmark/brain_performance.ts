import { EpisodicMemory } from "../../src/brain/episodic.js";
import { join } from "path";
import { rm } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

// Mock LLM
const mockLLM = {
    embed: async (text: string) => {
        // Simple consistent hash for testing
        // This ensures identical queries get identical vectors
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        // Normalize to some vector-like array
        const val = Math.abs(hash % 1000) / 1000;
        return new Array(1536).fill(val);
    }
} as any;

const NUM_EPISODES = 1000;
const CONCURRENT_QUERIES = 100;
const FRAMEWORKS = ["aider", "claude", "crewai", "autogen", "langgraph"];

async function benchmark() {
    const testDir = join(process.cwd(), "benchmark_brain");
    if (existsSync(testDir)) {
        await rm(testDir, { recursive: true, force: true });
    }

    console.log("Starting Brain Performance Benchmark...");
    console.log(`Episodes: ${NUM_EPISODES}`);
    console.log(`Concurrent Queries: ${CONCURRENT_QUERIES}`);
    console.log(`Frameworks: ${FRAMEWORKS.join(", ")}`);

    const memory = new EpisodicMemory(testDir, mockLLM);
    // Force mock embeddings
    process.env.MOCK_EMBEDDINGS = "true";
    process.env.BRAIN_STORAGE_ROOT = "";

    console.log("\nPhase 1: Ingestion (Storing Data)...");
    const startIngest = Date.now();

    // Generate data
    const promises = [];
    for (let i = 0; i < NUM_EPISODES; i++) {
        const fw = FRAMEWORKS[i % FRAMEWORKS.length];
        const taskId = `task-${i}`;
        const request = `Fix bug in ${fw} integration regarding memory leak in module ${i}`;
        const solution = `Updated specific lines in ${fw} module ${i} to release resources.`;

        // Use mixed companies to test multi-tenant perf too
        const company = `company-${i % 5}`; // 5 companies

        promises.push(memory.store(taskId, request, solution, [], company, undefined, undefined, undefined, 1000, 500));

        if (promises.length >= 50) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }
    if (promises.length > 0) await Promise.all(promises);

    const ingestTime = Date.now() - startIngest;
    console.log(`Ingestion completed in ${ingestTime}ms (${(NUM_EPISODES / (ingestTime/1000)).toFixed(2)} eps/sec)`);

    console.log("\nPhase 2: Retrieval (Latency & Token Reduction)...");

    const queryPromises = [];
    const queries = [];
    for (let i = 0; i < CONCURRENT_QUERIES; i++) {
        const fw = FRAMEWORKS[i % FRAMEWORKS.length];
        queries.push({
            query: `memory leak in ${fw}`,
            company: `company-${i % 5}`
        });
    }

    const startQuery = Date.now();

    for (const q of queries) {
        queryPromises.push(memory.recall(q.query, 5, q.company));
    }

    const results = await Promise.all(queryPromises);
    const queryTime = Date.now() - startQuery;

    console.log(`Retrieval completed in ${queryTime}ms`);
    console.log(`Throughput: ${(CONCURRENT_QUERIES / (queryTime/1000)).toFixed(2)} queries/sec`);
    console.log(`Average Latency: ${(queryTime / CONCURRENT_QUERIES).toFixed(2)}ms`);

    // Calculate Token Reduction
    let totalTokensPossible = 0;
    let totalTokensRetrieved = 0;

    // Estimate total history size per company
    const historyPerCompany = NUM_EPISODES / 5;
    const avgTokensPerEp = 1000; // Assumed

    for (let i = 0; i < CONCURRENT_QUERIES; i++) {
        const fullContextTokens = historyPerCompany * avgTokensPerEp;

        const retrieved = results[i];
        const retrievedTokens = retrieved.length * avgTokensPerEp;

        totalTokensPossible += fullContextTokens;
        totalTokensRetrieved += retrievedTokens;
    }

    const reduction = ((totalTokensPossible - totalTokensRetrieved) / totalTokensPossible) * 100;
    console.log(`\nToken Reduction Efficiency: ${reduction.toFixed(2)}%`);
    console.log(`(Simulated comparison: Full History Context vs Retrieved Context)`);

    // Verify results validity
    const valid = results.every(r => r.length > 0);
    console.log(`\nQuery Success Rate: ${valid ? "100%" : "Partial (some empty)"}`);

    // Cleanup
    await rm(testDir, { recursive: true, force: true });
}

benchmark().catch(console.error);
