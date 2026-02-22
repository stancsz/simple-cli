import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import fetch from 'node-fetch';

describe('Dashboard Integration', () => {
    const testDir = join(process.cwd(), 'temp_dashboard_test');
    const metricsPort = 3005;
    let cp: ChildProcess;

    beforeEach(async () => {
        await rm(testDir, { recursive: true, force: true });
        await mkdir(testDir, { recursive: true });
        // Setup config
        await mkdir(join(testDir, '.agent'), { recursive: true });
        await writeFile(join(testDir, '.agent', 'config.json'), JSON.stringify({
            companies: ['test-company']
        }));
    });

    afterEach(async () => {
        if (cp) {
            cp.kill();
            // Wait for process to exit
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await rm(testDir, { recursive: true, force: true });
    });

    it('should aggregate metrics from EpisodicMemory', async () => {
        // 1. Populate Brain
        process.env.BRAIN_STORAGE_ROOT = join(testDir, '.agent', 'brain', 'episodic');
        process.env.JULES_AGENT_DIR = join(testDir, '.agent');

        // Mock LLM embeddings to avoid API calls
        process.env.MOCK_EMBEDDINGS = "true";

        const episodic = new EpisodicMemory(testDir); // Use testDir as base
        // Note: EpisodicMemory constructor uses env var BRAIN_STORAGE_ROOT if set, which we did.

        await episodic.init();

        // Add some episodes
        await episodic.store(
            'task-1', 'req1', 'sol1', [], 'test-company', undefined, undefined, undefined,
            1000, 5000 // 1000 tokens, 5s
        );
        await episodic.store(
            'task-2', 'req2', 'Outcome: Failure\nSome error', [], 'test-company', undefined, undefined, undefined,
            500, 2000 // 500 tokens, 2s
        );

        // 2. Start Health Monitor
        const env = {
            ...process.env,
            PORT: metricsPort.toString(),
            JULES_AGENT_DIR: join(testDir, '.agent'),
            BRAIN_STORAGE_ROOT: join(testDir, '.agent', 'brain', 'episodic'),
            MOCK_EMBEDDINGS: "true"
        };

        cp = spawn('npx', ['tsx', 'src/mcp_servers/health_monitor/index.ts'], {
            env,
            detached: false,
            stdio: 'inherit' // See logs
        });

        // Wait for server to start
        console.log("Waiting for Health Monitor to start...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            // 3. Query API
            const response = await fetch(`http://localhost:${metricsPort}/api/metrics`);

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API failed: ${response.status} ${text}`);
            }

            const data = await response.json();
            console.log("Metrics Response:", data);

            expect(data).toHaveProperty('test-company');
            expect(data['test-company']).toMatchObject({
                total_tokens: 1500,
                task_count: 2,
                success_rate: 50
            });
            // avg duration: (5000+2000)/2 = 3500
            expect(data['test-company'].avg_duration_ms).toBe(3500);

            // Cost: 1500 tokens * $5 / 1M = 0.0075
            expect(data['test-company'].estimated_cost_usd).toBeCloseTo(0.0075);

        } catch (e) {
            console.error(e);
            throw e;
        }
    }, 30000);
});
