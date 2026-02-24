import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';

const BENCHMARK_SCRIPT = join(process.cwd(), 'scripts', 'benchmark', 'run_benchmark.ts');
const RESULTS_FILE = join(process.cwd(), 'benchmarks', 'results', 'latest.json');
const DASHBOARD_FILE = join(process.cwd(), 'scripts', 'dashboard', 'public', 'benchmarks.json');

describe('Benchmark Suite Integration', () => {
    // Increase timeout for benchmark run
    const TIMEOUT = 120000;

    beforeAll(() => {
        // Cleanup previous results
        if (existsSync(RESULTS_FILE)) rmSync(RESULTS_FILE);
        if (existsSync(DASHBOARD_FILE)) rmSync(DASHBOARD_FILE);
        // Cleanup metrics for clean test
        const date = new Date().toISOString().split('T')[0];
        const metricsFile = join(process.cwd(), '.agent', 'metrics', `${date}.ndjson`);
        if (existsSync(metricsFile)) rmSync(metricsFile);
    });

    it('should run a specific benchmark task and generate results', async () => {
        // Run only 'code_fix' task to be faster
        // We set MOCK_LLM to true to avoid API calls (it will likely fail the task validation, but that's expected)
        // Wait, if validation fails, the benchmark result will have success: false. That's fine.
        // We mainly want to test the harness.

        await new Promise<void>((resolve, reject) => {
            const proc = spawn('npx', ['tsx', BENCHMARK_SCRIPT, '--task', 'code_fix'], {
                env: { ...process.env, MOCK_LLM: 'true', CI: 'true' },
                stdio: 'inherit'
            });

            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error('Benchmark timed out'));
            }, TIMEOUT);

            proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) resolve();
                else reject(new Error(`Benchmark script exited with code ${code}`));
            });
        });

        // Verify results file exists
        expect(existsSync(RESULTS_FILE)).toBe(true);

        const results = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
        expect(results.timestamp).toBeDefined();
        expect(Array.isArray(results.results)).toBe(true);

        // Should have at least 3 entries: Simple-CLI, Aider (Simulated), Cursor (Simulated)
        // For the 'code_fix' task
        const taskResults = results.results.filter((r: any) => r.task === 'code_fix');
        expect(taskResults.length).toBeGreaterThanOrEqual(3);

        const simpleCli = taskResults.find((r: any) => r.tool === 'Simple-CLI');
        expect(simpleCli).toBeDefined();
        // It might fail validation due to MOCK_LLM, so just check structure
        expect(simpleCli.duration_ms).toBeGreaterThan(0);
        expect(simpleCli.tokens_total).toBeGreaterThan(0); // Should be >0 thanks to updated MOCK_LLM logic

        const aider = taskResults.find((r: any) => r.tool === 'Aider (Simulated)');
        expect(aider).toBeDefined();
        expect(aider.success).toBe(true); // Mock is always successful

        // Verify dashboard file exists
        expect(existsSync(DASHBOARD_FILE)).toBe(true);
        const dashboardData = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf-8'));
        expect(dashboardData.results).toEqual(results.results);

    }, TIMEOUT + 5000);
});
