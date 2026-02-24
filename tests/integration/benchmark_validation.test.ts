import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

describe('Benchmark Suite Integration', () => {
    const resultsPath = join(process.cwd(), 'benchmarks', 'results.json');
    const dashboardPath = join(process.cwd(), 'docs', 'assets', 'benchmarks.json');

    it('should run the benchmark suite and generate valid results', async () => {
        // Execute the runner
        const { stdout, stderr } = await execAsync('npx tsx benchmarks/runner.ts', {
            timeout: 60000,
            env: { ...process.env, CI: 'true' }
        });

        console.log("Benchmark Output:", stdout);
        if (stderr) console.error("Benchmark Stderr:", stderr);

        // Verify output file exists
        expect(existsSync(resultsPath)).toBe(true);

        // Validate structure
        const content = await readFile(resultsPath, 'utf-8');
        const results = JSON.parse(content);

        expect(results).toHaveProperty('timestamp');
        expect(results).toHaveProperty('metrics');
        expect(results.metrics).toHaveProperty('integration_speed');
        expect(results.metrics).toHaveProperty('token_efficiency');

        // Validate Integration Speed
        const integration = results.metrics.integration_speed;
        expect(Array.isArray(integration)).toBe(true);
        expect(integration.length).toBe(3); // Roo Code, SWE-agent, Aider
        expect(integration[0]).toHaveProperty('framework');
        expect(integration[0]).toHaveProperty('integration_time_ms');
        expect(integration[0].status).toBe('success');

        // Validate Token Efficiency
        const tokens = results.metrics.token_efficiency;
        expect(tokens).toHaveProperty('traditional_tokens');
        expect(tokens).toHaveProperty('brain_tokens');
        expect(tokens.brain_tokens).toBeLessThan(tokens.traditional_tokens);
    }, 60000);

    it('should update the dashboard dataset', async () => {
        expect(existsSync(dashboardPath)).toBe(true);

        const content = await readFile(dashboardPath, 'utf-8');
        const dashboard = JSON.parse(content);

        expect(Array.isArray(dashboard)).toBe(true);
        expect(dashboard.length).toBeGreaterThan(0);

        const latest = dashboard[dashboard.length - 1];
        expect(latest).toHaveProperty('metrics');
    });
});
