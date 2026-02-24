import { runIntegrationBenchmark } from './integration_speed.js';
import { runTokenEfficiencyBenchmark } from './token_efficiency.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function runBenchmarkSuite() {
    console.log("Running Simple-CLI Benchmark Suite...");
    const timestamp = new Date().toISOString();

    // 1. Integration Speed
    console.log("\n[1/2] Running Integration Speed Benchmark...");
    let integrationResults = [];
    try {
        integrationResults = await runIntegrationBenchmark();
    } catch (e) {
        console.error("Integration benchmark failed:", e);
        integrationResults = [{ error: (e as Error).message }];
    }

    // 2. Token Efficiency
    console.log("\n[2/2] Running Token Efficiency Benchmark...");
    let tokenResults = {};
    try {
        tokenResults = await runTokenEfficiencyBenchmark(); // This is just an object, not array
    } catch (e) {
        console.error("Token efficiency benchmark failed:", e);
        tokenResults = { error: (e as Error).message };
    }

    const output = {
        timestamp,
        metrics: {
            integration_speed: integrationResults,
            token_efficiency: tokenResults
        }
    };

    // Save to benchmarks/results.json
    const resultsDir = join(process.cwd(), 'benchmarks');
    await mkdir(resultsDir, { recursive: true });

    const outputPath = join(resultsDir, 'results.json');
    await writeFile(outputPath, JSON.stringify(output, null, 2));

    console.log(`\nBenchmark suite completed.`);
    console.log(`Results saved to ${outputPath}`);

    // Update Dashboard
    try {
        console.log("Updating dashboard...");
        await execAsync('npx tsx scripts/update_benchmark_dashboard.ts');
        console.log("Dashboard updated successfully.");
    } catch (e) {
        console.error("Failed to update dashboard:", e);
    }

    return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runBenchmarkSuite().catch((e) => {
        console.error("Benchmark runner failed:", e);
        process.exit(1);
    });
}
