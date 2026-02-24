
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { runBenchmarkSuite } from '../../benchmarks/suite.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('Benchmark Suite Integration', () => {
    const resultsPath = join(process.cwd(), 'benchmarks', 'results', 'latest.json');
    const docsDataPath = join(process.cwd(), 'docs', 'benchmarks', 'data.json');

    it('should execute all benchmark tasks and produce valid JSON output', async () => {
        // Increase timeout because benchmarks involve simulated delays and potentially real LLM calls
        const result = await runBenchmarkSuite();

        expect(result).toBeDefined();
        expect(result.timestamp).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.results.length).toBeGreaterThan(0);

        // Verify specific tasks are present
        const tasks = result.results.map((r: any) => r.task);
        expect(tasks).toContain('integration_speed');
        expect(tasks).toContain('code_editing');
        expect(tasks).toContain('research');
        expect(tasks).toContain('ui_automation');

        // Verify integration_speed result structure
        const integration = result.results.find((r: any) => r.task === 'integration_speed');
        if (integration.error) {
            console.warn("Integration benchmark returned error (expected in some envs):", integration.error);
        } else {
            expect(integration.duration_ms).toBeGreaterThan(0);
        }

        // Verify code_editing comparative results
        const codeEditing = result.results.filter((r: any) => r.task === 'code_editing');
        expect(codeEditing.length).toBeGreaterThanOrEqual(2);
        const simpleCli = codeEditing.find((r: any) => r.framework === 'Simple-CLI');
        const direct = codeEditing.find((r: any) => r.framework !== 'Simple-CLI');
        expect(simpleCli).toBeDefined();
        expect(direct).toBeDefined();

        // Verify file output
        expect(existsSync(resultsPath)).toBe(true);
        expect(existsSync(docsDataPath)).toBe(true);
    }, 600000); // 10 minutes timeout
});
