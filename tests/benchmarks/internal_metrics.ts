import { ContextManager } from '../../src/context_manager';
import { getActiveSkill, buildSkillPrompt } from '../../src/skills';
import { performance } from 'perf_hooks';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

async function benchmarkMemory() {
    console.log('--- Benchmarking Memory (ContextManager) ---');
    const cwd = join(process.cwd(), '.benchmark_test');
    if (!existsSync(cwd)) mkdirSync(cwd);

    // Ensure .agent directory exists
    const agentDir = join(cwd, '.agent');
    if (!existsSync(agentDir)) mkdirSync(agentDir);

    const cm = new ContextManager(cwd);

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
