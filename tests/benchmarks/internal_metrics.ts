import { ContextManager } from '../../src/context_manager';
import { getActiveSkill, buildSkillPrompt } from '../../src/skills';
import { performance } from 'perf_hooks';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Mock embedding model for benchmark
const mockEmbeddingModel = {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock-embedding',
    doEmbed: async ({ values }: any) => {
         // minimal simulation of embedding generation
         return {
            embeddings: values.map(() => Array(1536).fill(0).map(() => Math.random())),
            usage: { tokens: 10 },
            warnings: [],
         };
    }
};

async function benchmarkMemory() {
    console.log('--- Benchmarking Memory (ContextManager) ---');
    const cwd = join(process.cwd(), '.benchmark_test');
    if (!existsSync(cwd)) mkdirSync(cwd);

    // Ensure .agent directory exists
    const agentDir = join(cwd, '.agent');
    if (!existsSync(agentDir)) mkdirSync(agentDir);

    // Use mock model for reliable benchmark
    const cm = new ContextManager(cwd, mockEmbeddingModel);

    // Clear previous context file
    const contextFile = join(agentDir, 'context.json');
    if (existsSync(contextFile)) {
        unlinkSync(contextFile);
    }

    const startWrite = performance.now();
    for (let i = 0; i < 100; i++) {
        await cm.addGoal(`Goal ${i}`);
    }
    const endWrite = performance.now();
    console.log(`Write 100 goals: ${(endWrite - startWrite).toFixed(2)}ms`);

    const startRead = performance.now();
    const summary = await cm.getContextSummary();
    const endRead = performance.now();
    console.log(`Read context summary: ${(endRead - startRead).toFixed(2)}ms`);
    console.log(`Context summary size: ${summary.length} chars`);

    // --- RAG Benchmark ---
    console.log('\n--- Benchmarking RAG (VectorStore + Mock Embedding) ---');

    const startVecAdd = performance.now();
    await cm.addMemory("The capital of France is Paris.", { type: "fact" });
    await cm.addMemory("The capital of Germany is Berlin.", { type: "fact" });
    await cm.addMemory("Node.js is a runtime.", { type: "tech" });
    const endVecAdd = performance.now();
    console.log(`Add 3 memories (mock embedding + sqlite-vec): ${(endVecAdd - startVecAdd).toFixed(2)}ms`);

    const startVecSearch = performance.now();
    const results = await cm.searchMemory("France capital");
    const endVecSearch = performance.now();
    console.log(`Search memory (mock embedding + query): ${(endVecSearch - startVecSearch).toFixed(2)}ms`);
    console.log(`Result (mock): ${results.trim().substring(0, 50)}...`);

    // Clean up
    rmSync(cwd, { recursive: true, force: true });
}

async function benchmarkOrchestration() {
    console.log('\n--- Benchmarking Orchestration (Skills) ---');

    const startLoad = performance.now();
    const skill = await getActiveSkill();
    const endLoad = performance.now();
    console.log(`Load Active Skill: ${(endLoad - startLoad).toFixed(2)}ms`);
    console.log(`Active Skill: ${skill.name}`);

    const startPrompt = performance.now();
    const prompt = buildSkillPrompt(skill, {
        repoMap: "file1.ts\nfile2.ts",
        files: ["file1.ts"]
    });
    const endPrompt = performance.now();
    console.log(`Build Skill Prompt: ${(endPrompt - startPrompt).toFixed(2)}ms`);
    console.log(`Prompt length: ${prompt.length} chars`);
}

async function main() {
    try {
        await benchmarkMemory();
        await benchmarkOrchestration();
    } catch (e) {
        console.error("Benchmark failed:", e);
        process.exit(1);
    }
}

main();
