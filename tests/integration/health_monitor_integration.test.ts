import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { MetricsCollector } from '../../src/mcp_servers/health_monitor/metrics_collector.js';
import { AlertManager } from '../../src/mcp_servers/health_monitor/alert_manager.js';
import { logMetric } from '../../src/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock logger.js logMetric because it uses hardcoded path
vi.mock('../../src/logger.js', () => ({
  logMetric: vi.fn(),
}));

const TEST_DIR = join(__dirname, '.test_agent_health');
const METRICS_DIR = join(TEST_DIR, '.agent', 'metrics');

describe('Health Monitor Integration', () => {
  beforeEach(() => {
    // Setup test dir
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(METRICS_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('MetricsCollector should aggregate metrics', async () => {
      const collector = new MetricsCollector(TEST_DIR);

      // Test track() calls logMetric
      await collector.track('test', 'cpu', 50);
      expect(logMetric).toHaveBeenCalledWith('test', 'cpu', 50, {});

      // Seed data for getMetrics
      const date = new Date().toISOString().split('T')[0];
      const metricsFile = join(METRICS_DIR, `${date}.ndjson`);
      const sampleMetric = {
          timestamp: new Date().toISOString(),
          agent: 'test',
          metric: 'latency',
          value: 100,
          tags: {}
      };

      writeFileSync(metricsFile, JSON.stringify(sampleMetric) + '\n');

      const metrics = await collector.getMetrics('last_hour');
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(100);
      expect(metrics[0].metric).toBe('latency');
  });

  it('AlertManager should trigger alerts', async () => {
      const manager = new AlertManager(TEST_DIR);

      // Add rule
      await manager.addRule({
          metric: 'latency',
          threshold: 50,
          operator: '>',
          contact: 'slack',
          created_at: new Date().toISOString()
      });

      // Verify rule persistence
      const rules = await manager.getRules();
      expect(rules.length).toBe(1);
      expect(rules[0].metric).toBe('latency');

      const metrics = [
          {
              timestamp: new Date().toISOString(),
              agent: 'test',
              metric: 'latency',
              value: 100,
              tags: {}
          }
      ];

      // Spy on sendAlert
      const sendSpy = vi.spyOn(manager, 'sendAlert');
      // Mock implementation to avoid real network calls
      sendSpy.mockImplementation(async () => {});

      const alerts = await manager.checkAlerts(metrics);
      expect(alerts.length).toBe(1);
      expect(alerts[0]).toContain('ALERT: latency is 100.00 (> 50)');
      expect(sendSpy).toHaveBeenCalled();
  });

  it('AlertManager should log alerts history', async () => {
       const manager = new AlertManager(TEST_DIR);

       // Manually log an alert
       const rule = {
          metric: 'test',
          threshold: 10,
          operator: '>' as const,
          created_at: new Date().toISOString()
       };
       await manager.sendAlert(rule, "Test Alert Message");

       const history = await manager.getAlertHistory();
       expect(history.length).toBe(1);
       expect(history[0].message).toBe("Test Alert Message");
  });
});
