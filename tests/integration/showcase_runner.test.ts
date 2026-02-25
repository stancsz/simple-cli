import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { saveShowcaseRun, getShowcaseRuns, ShowcaseRun } from '../../src/mcp_servers/health_monitor/showcase_reporter.js';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
    spawn: vi.fn()
}));

import { spawn } from 'child_process';
import { runShowcase } from '../../scripts/showcase-runner.js';

const RUNS_FILE = join(process.cwd(), '.agent', 'health_monitor', 'showcase_runs.json');

describe('Showcase Reporter', () => {
    beforeEach(() => {
        if (existsSync(RUNS_FILE)) unlinkSync(RUNS_FILE);
    });

    afterEach(() => {
        if (existsSync(RUNS_FILE)) unlinkSync(RUNS_FILE);
    });

    it('should save and retrieve showcase runs', async () => {
        const run: ShowcaseRun = {
            id: 'test-id',
            timestamp: new Date().toISOString(),
            success: true,
            total_duration_ms: 1000,
            steps: [{ name: 'Step 1', status: 'success' }],
            artifact_count: 5
        };

        await saveShowcaseRun(run);
        const runs = await getShowcaseRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].id).toBe('test-id');
        expect(runs[0].success).toBe(true);
    });
});

describe('Showcase Runner Script', () => {
    beforeEach(() => {
        if (existsSync(RUNS_FILE)) unlinkSync(RUNS_FILE);
        vi.clearAllMocks();
        // Prevent process.exit
        vi.spyOn(process, 'exit').mockImplementation((code) => {
             throw new Error(`Process exit with code ${code}`);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (existsSync(RUNS_FILE)) unlinkSync(RUNS_FILE);
    });

    it('should run showcase and save success result', async () => {
        // Mock spawn behavior
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();

        (spawn as any).mockReturnValue(mockChild);

        // Run the script logic
        const runnerPromise = runShowcase();

        // Simulate output
        setTimeout(() => {
            mockChild.stdout.emit('data', '--- Pillar 1: Company Context ---\n');
            mockChild.stdout.emit('data', '✅ Showcase Simulation Complete!\n');
            mockChild.emit('close', 0);
        }, 100);

        // Wait for completion (expecting exit(0) which throws)
        await expect(runnerPromise).rejects.toThrow('Process exit with code 0');

        // Verify saveShowcaseRun was called or file updated
        const runs = await getShowcaseRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].success).toBe(true);
        expect(runs[0].steps).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Pillar 1: Company Context', status: 'success' })
        ]));
    });

    it('should handle failure', async () => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        (spawn as any).mockReturnValue(mockChild);

        const runnerPromise = runShowcase();

        setTimeout(() => {
             mockChild.stdout.emit('data', 'Error: Something went wrong\n');
             mockChild.emit('close', 1);
        }, 100);

        await expect(runnerPromise).rejects.toThrow('Process exit with code 1');

        const runs = await getShowcaseRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0].success).toBe(false);
    });
});
