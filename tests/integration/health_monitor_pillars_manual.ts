
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import assert from 'assert';

// Setup environment
const TEST_DIR = join(process.cwd(), 'temp_test_health_monitor_manual');
process.env.JULES_AGENT_DIR = TEST_DIR;
// We can't easily mock config.js loadConfig.
// But loadConfig reads from disk (agent config).
// So we can write a config file to TEST_DIR!
// Wait, loadConfig uses `dirname(AGENT_DIR)` as config path?
// index.ts: `const config = await loadConfig(dirname(AGENT_DIR));`
// AGENT_DIR is `.agent`. dirname is repo root.
// loadConfig reads `config/companies.json` or similar?

// Let's check src/config.ts to see where it reads from.
// It usually reads from `config/` directory relative to root.

// If I cannot control companies list easily, I might get empty list.
// But `temp_test_runner.ts` output `{}` which implies empty list or errors.

// I'll try to rely on existing config or defaults.
// If I can't, I will just accept that I test pillar logic via unit test on `getPillarMetrics` if I exported it.
// I exported `getPillarMetrics`!

// So I can test `getPillarMetrics` directly without worrying about `EpisodicMemory` or `aggregateCompanyMetrics` logic (which depends on Brain).

// `getPillarMetrics` relies on `METRICS_DIR`.
// I can set `JULES_AGENT_DIR` and put files there.

// Test Plan:
// 1. Setup `JULES_AGENT_DIR` and create metric files.
// 2. Call `getPillarMetrics`.
// 3. Assert results.

async function runTest() {
    console.log("Running manual integration test for Pillar Metrics...");

    // Dynamic import to ensure env var is picked up
    const { getPillarMetrics } = await import('../../src/mcp_servers/health_monitor/index.js');

    // Cleanup
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, 'metrics'), { recursive: true });

    try {
        // 1. Setup Metric Files
        const today = new Date().toISOString().split('T')[0];
        const metricFile = join(TEST_DIR, 'metrics', `${today}.ndjson`);

        const metricsData = [
          { timestamp: new Date().toISOString(), agent: 'health_monitor', metric: 'sop_execution_success_rate', value: 95, tags: { company: 'company_a', pillar: 'sop' } },
          { timestamp: new Date().toISOString(), agent: 'health_monitor', metric: 'ghost_task_completion_rate', value: 80, tags: { company: 'company_a', pillar: 'ghost' } },
          { timestamp: new Date().toISOString(), agent: 'health_monitor', metric: 'hr_proposals_generated', value: 5, tags: { company: 'company_b', pillar: 'hr' } },
          { timestamp: new Date().toISOString(), agent: 'health_monitor', metric: 'context_queries', value: 100, tags: { company: 'company_c', pillar: 'context' } }
        ];

        writeFileSync(metricFile, metricsData.map(m => JSON.stringify(m)).join('\n'));

        // 2. Call getPillarMetrics
        const data = await getPillarMetrics(7);
        console.log("Data received:", JSON.stringify(data, null, 2));

        // 3. Verify
        assert(data.company_a, "company_a missing");
        assert.strictEqual(data.company_a.sop.metrics.sop_execution_success_rate, 95);
        assert.strictEqual(data.company_a.ghost.metrics.ghost_task_completion_rate, 80);

        assert(data.company_b, "company_b missing");
        assert.strictEqual(data.company_b.hr.metrics.hr_proposals_generated, 5);

        assert(data.company_c, "company_c missing");
        assert.strictEqual(data.company_c.context.metrics.context_queries, 100);

        console.log("✅ Test Passed!");
    } catch (e) {
        console.error("❌ Test Failed:", e);
        process.exit(1);
    } finally {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

runTest();
