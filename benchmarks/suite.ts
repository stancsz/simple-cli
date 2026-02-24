
import { runIntegrationBenchmark } from './tasks/integration_speed.js';
import { runCodeEditingBenchmark } from './tasks/code_editing.js';
import { runResearchBenchmark } from './tasks/research.js';
import { runUIBenchmark } from './tasks/ui_automation.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function runBenchmarkSuite() {
    console.log("Running Simple-CLI Benchmark Suite...");
    const timestamp = new Date().toISOString();
    const results: any[] = [];

    // 1. Integration Speed (Ingest-Digest-Deploy)
    try {
        const integrationResult = await runIntegrationBenchmark();
        results.push(integrationResult);
    } catch (e) {
        console.error("Integration benchmark failed:", e);
        results.push({ task: "integration_speed", error: (e as Error).message });
    }

    // 2. Code Editing (Context vs Direct)
    try {
        const codeResults = await runCodeEditingBenchmark();
        results.push(...codeResults);
    } catch (e) {
        console.error("Code editing benchmark failed:", e);
        results.push({ task: "code_editing", error: (e as Error).message });
    }

    // 3. Research (Brain vs Loop)
    try {
        const researchResults = await runResearchBenchmark();
        results.push(...researchResults);
    } catch (e) {
        console.error("Research benchmark failed:", e);
        results.push({ task: "research", error: (e as Error).message });
    }

    // 4. UI Automation (Orchestrator vs Stagehand)
    try {
        const uiResults = await runUIBenchmark();
        results.push(...uiResults);
    } catch (e) {
        console.error("UI benchmark failed:", e);
        results.push({ task: "ui_automation", error: (e as Error).message });
    }

    const output = {
        timestamp,
        results
    };

    // Save to benchmarks/results/latest.json
    const resultsDir = join(process.cwd(), 'benchmarks', 'results');
    await mkdir(resultsDir, { recursive: true });
    await writeFile(join(resultsDir, 'latest.json'), JSON.stringify(output, null, 2));

    // Save to docs/benchmarks/data.json (for dashboard)
    const docsDataDir = join(process.cwd(), 'docs', 'benchmarks');
    await mkdir(docsDataDir, { recursive: true });
    await writeFile(join(docsDataDir, 'data.json'), JSON.stringify(output, null, 2));

    console.log("Benchmark suite completed.");
    console.log(`Results saved to ${join(resultsDir, 'latest.json')}`);
    return output;
}

if (process.argv[1] === import.meta.url) {
    runBenchmarkSuite().catch(console.error);
}
