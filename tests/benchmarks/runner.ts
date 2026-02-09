import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { Benchmark, Task } from './types';

function runCli(cwd: string, prompt: string): { stdout: string, stderr: string, status: number | null } {
    const cliPath = join(process.cwd(), 'dist', 'cli.js');
    if (!existsSync(cliPath)) {
        throw new Error(`CLI not found at ${cliPath}. Did you run 'npm run build'?`);
    }

    // Set CLAW_WORKSPACE to invoke specific agent behavior if needed, or just let it use cwd
    const env = { ...process.env, CLAW_WORKSPACE: cwd };

    const result = spawnSync('node', [cliPath, '--non-interactive', prompt], {
        cwd,
        encoding: 'utf-8',
        timeout: 180000, // 180s timeout
        env
    });
    return result;
}

export async function runBenchmark(benchmark: Benchmark) {
    console.log(`\nRunning Benchmark: ${benchmark.name}`);
    console.log(`Description: ${benchmark.description}`);
    console.log('='.repeat(50));

    let passed = 0;
    const total = benchmark.tasks.length;

    for (const task of benchmark.tasks) {
        console.log(`\nTask: ${task.name}`);

        const workDir = mkdtempSync(join(tmpdir(), 'benchmark-'));

        try {
            if (task.setup) {
                task.setup(workDir);
            }

            const start = Date.now();
            const { stdout, stderr, status } = runCli(workDir, task.prompt);
            const duration = Date.now() - start;

            // Some tasks might expect failure, but generally we expect success (status 0)
            // If the CLI crashes, status != 0
            if (status !== 0) {
                console.error(`❌ CLI Failed (Exit Code: ${status})`);
                if (stderr) console.error(stderr);
            }

            const success = await task.verify(workDir, stdout);

            if (success) {
                console.log(`✅ Passed (${duration}ms)`);
                passed++;
            } else {
                console.log(`❌ Failed`);
            }

        } catch (e: any) {
            console.error(`❌ Error: ${e.message}`);
        } finally {
            try {
                rmSync(workDir, { recursive: true, force: true });
            } catch {}
        }
    }

    console.log('='.repeat(50));
    console.log(`Result: ${passed}/${total} passed.`);
    return passed === total;
}

// Main execution block
// We use dynamic import for definitions to avoid circular dependency issues during development/testing
async function main() {
    try {
        // @ts-ignore
        const { benchmarks } = await import('./definitions');

        let allPassed = true;
        for (const b of benchmarks) {
            const success = await runBenchmark(b);
            if (!success) allPassed = false;
        }

        if (!allPassed) {
            process.exit(1);
        }
    } catch (e: any) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') {
            console.error("tests/benchmarks/definitions.js not found. Please create it first.");
        } else {
            console.error(e);
        }
        process.exit(1);
    }
}

if (process.argv[1] && process.argv[1].endsWith('runner.ts')) {
   main().catch(console.error);
}
