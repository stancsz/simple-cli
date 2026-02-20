import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import fetch from "node-fetch"; // Import fetch

const testDir = join(tmpdir(), 'health-alert-test');

// Mock utils
vi.mock("../../src/mcp_servers/health_monitor/utils.js", () => {
    const path = require('path');
    const fs = require('fs/promises');
    const fsSync = require('fs');
    const testDir = path.join(require('os').tmpdir(), 'health-alert-test');

    return {
        AGENT_DIR: testDir,
        METRICS_DIR: path.join(testDir, 'metrics'),
        getMetricFiles: async (days) => {
             const metricsDir = path.join(testDir, 'metrics');
             if (!fsSync.existsSync(metricsDir)) return [];
             const files = await fs.readdir(metricsDir);
             return files.filter(f => f.endsWith('.ndjson')).map(f => path.join(metricsDir, f));
        },
        readNdjson: async (filepath) => {
             const content = await fs.readFile(filepath, 'utf-8');
             return content.trim().split('\n').map(l => {
                try { return JSON.parse(l); } catch { return null; }
             }).filter(Boolean);
        }
    };
});

// Mock fetch
vi.mock("node-fetch", () => ({ default: vi.fn() }));

// Import AlertManager after mocking
import { AlertManager } from "../../src/mcp_servers/health_monitor/alerting.js";

describe("Health Alerting System", () => {
    let alertManager: AlertManager;

    beforeAll(async () => {
        if (existsSync(testDir)) await rm(testDir, { recursive: true, force: true });
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, 'metrics'), { recursive: true });
        await mkdir(join(testDir, 'health'), { recursive: true });
    });

    afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    beforeEach(async () => {
        vi.mocked(fetch).mockClear();
        // Reset config
        await writeFile(join(testDir, 'config.json'), JSON.stringify({
            yoloMode: false,
            enable_alerts: true
        }));
        // Clear alerts
        const activeAlertsFile = join(testDir, 'health', 'active_alerts.json');
        if (existsSync(activeAlertsFile)) await rm(activeAlertsFile);
        const rulesFile = join(testDir, 'health', 'alert_rules.json');
        if (existsSync(rulesFile)) await rm(rulesFile);

        alertManager = new AlertManager();
        await alertManager.init();
    });

    it("should create an alert rule", async () => {
        const rule = await alertManager.addRule({
            metric: "test_metric",
            threshold: 10,
            operator: ">",
            channel: { type: "webhook", target: "http://example.com" }
        });

        expect(rule.id).toBeDefined();

        const rules = await alertManager.getRules();
        expect(rules).toHaveLength(1);
        expect(rules[0].metric).toBe("test_metric");
    });

    it("should trigger an alert when threshold is breached", async () => {
        // 1. Create Rule
        await alertManager.addRule({
            metric: "high_latency",
            threshold: 100,
            operator: ">",
            channel: { type: "webhook", target: "http://webhook.site" }
        });

        // 2. Write Metric Data
        const today = new Date().toISOString().split('T')[0];
        const metricFile = join(testDir, 'metrics', `${today}.ndjson`);
        const metrics = [
            { timestamp: new Date().toISOString(), agent: 'test', metric: 'high_latency', value: 150 },
            { timestamp: new Date().toISOString(), agent: 'test', metric: 'high_latency', value: 200 }
        ];

        await writeFile(metricFile, metrics.map(m => JSON.stringify(m)).join('\n'));

        // 3. Check Alerts
        await alertManager.checkAlerts();

        // 4. Verify Active Alert
        const alerts = await alertManager.getActiveAlerts();
        expect(alerts).toHaveLength(1);
        expect(alerts[0].metric).toBe("high_latency");
        expect(alerts[0].value).toBe(175); // Average

        // 5. Verify Notification
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith("http://webhook.site", expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining("175.00")
        }));
    });

    it("should resolve alert when metric returns to normal", async () => {
        // Setup rule
        await alertManager.addRule({
            metric: "cpu_load",
            threshold: 80,
            operator: ">",
            channel: { type: "webhook", target: "http://example.com" }
        });

        const today = new Date().toISOString().split('T')[0];
        const metricFile = join(testDir, 'metrics', `${today}.ndjson`);

        // High metric
        await writeFile(metricFile, JSON.stringify({ timestamp: new Date().toISOString(), agent: 'test', metric: 'cpu_load', value: 90 }));
        await alertManager.checkAlerts();
        expect(await alertManager.getActiveAlerts()).toHaveLength(1);

         // Normal metric
         await writeFile(metricFile, JSON.stringify({ timestamp: new Date().toISOString(), agent: 'test', metric: 'cpu_load', value: 50 }));

         await alertManager.checkAlerts();

         const alerts = await alertManager.getActiveAlerts();
         expect(alerts).toHaveLength(0);
    });

    it("should not alert if disabled in config", async () => {
         await writeFile(join(testDir, 'config.json'), JSON.stringify({
            yoloMode: false,
            enable_alerts: false
        }));

        await alertManager.addRule({
            metric: "test_disabled",
            threshold: 10,
            operator: ">",
            channel: { type: "webhook", target: "http://example.com" }
        });

        const today = new Date().toISOString().split('T')[0];
        const metricFile = join(testDir, 'metrics', `${today}.ndjson`);
        await writeFile(metricFile, JSON.stringify({ timestamp: new Date().toISOString(), agent: 'test', metric: 'test_disabled', value: 100 }));

        await alertManager.checkAlerts();

        expect(fetch).not.toHaveBeenCalled();
    });
});
