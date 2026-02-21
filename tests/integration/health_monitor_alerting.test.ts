import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlertManager } from '../../src/mcp_servers/health_monitor/alert_manager.js';
import { join } from 'path';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

describe('Health Monitor Alerting Integration', () => {
  let tempDir: string;
  let alertManager: AlertManager;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'health-monitor-test-'));
    alertManager = new AlertManager(tempDir);
    await alertManager.init();
  });

  afterEach(async () => {
    // Cleanup
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should create and persist alert rules', async () => {
    const rule = await alertManager.addRule('latency', 500, '>', 'slack:webhook');

    expect(rule.metric).toBe('latency');
    expect(rule.threshold).toBe(500);

    const rulesFile = join(tempDir, 'health', 'alert_rules.json');
    expect(existsSync(rulesFile)).toBe(true);

    const content = JSON.parse(await readFile(rulesFile, 'utf-8'));
    expect(content).toHaveLength(1);
    expect(content[0].id).toBe(rule.id);
  });

  it('should trigger an alert when threshold is breached', async () => {
    await alertManager.addRule('latency', 100, '>');

    // Normal value
    await alertManager.checkMetric('latency', 50);
    let alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(0);

    // Breach value
    await alertManager.checkMetric('latency', 150);
    alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metric).toBe('latency');
    expect(alerts[0].value).toBe(150);
    expect(alerts[0].status).toBe('active');

    // Persistence check
    const alertsFile = join(tempDir, 'health', 'alerts.json');
    expect(existsSync(alertsFile)).toBe(true);
    const content = JSON.parse(await readFile(alertsFile, 'utf-8'));
    expect(content).toHaveLength(1);
  });

  it('should update existing alert instead of creating duplicate', async () => {
    await alertManager.addRule('error_rate', 0.1, '>');

    await alertManager.checkMetric('error_rate', 0.2);
    let alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(1);
    const firstUpdate = alerts[0].updated_at;

    // Wait a bit to ensure timestamp difference
    await new Promise(r => setTimeout(r, 10));

    await alertManager.checkMetric('error_rate', 0.3);
    alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].value).toBe(0.3);
    expect(alerts[0].updated_at).not.toBe(firstUpdate);
  });

  it('should escalate alert after 5 minutes', async () => {
    await alertManager.addRule('cpu', 90, '>');

    // Create alert
    await alertManager.checkMetric('cpu', 95);
    let alerts = alertManager.getActiveAlerts();
    expect(alerts[0].status).toBe('active');

    // Mock Date.now to fast forward 6 minutes
    const now = Date.now();
    const future = now + 6 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(future);

    await alertManager.checkEscalation();

    alerts = alertManager.getActiveAlerts();
    expect(alerts[0].status).toBe('critical');
  });

  it('should resolve alerts', async () => {
    await alertManager.addRule('disk', 90, '>');
    await alertManager.checkMetric('disk', 95);

    const alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(1);

    const success = await alertManager.resolveAlert(alerts[0].id);
    expect(success).toBe(true);

    expect(alertManager.getActiveAlerts()).toHaveLength(0);

    // Verify persistence of resolution
    const alertsFile = join(tempDir, 'health', 'alerts.json');
    const content = JSON.parse(await readFile(alertsFile, 'utf-8'));
    expect(content[0].status).toBe('resolved');
  });

  it('should handle namespaced metrics (agent:metric)', async () => {
    await alertManager.addRule('latency', 200, '>');

    // Should trigger for llm:latency
    await alertManager.checkMetric('llm:latency', 250);

    const alerts = alertManager.getActiveAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].metric).toBe('latency'); // Rule metric
    // Wait, checkMetric implementation logic check:
    // if (rule.metric !== metric && !metric.endsWith(`:${rule.metric}`)) continue;
    // The alert is created with `rule.metric` as key?
    // In AlertManager.ts: metric: rule.metric
    // But checkMetric receives `llm:latency`.
    // The alert object has `metric: rule.metric`.
    expect(alerts[0].metric).toBe('latency');
  });
});
