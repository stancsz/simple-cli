import { describe, it, expect } from 'vitest';
import { detectAnomalies, predictMetrics } from '../../src/mcp_servers/health_monitor/anomaly_detector';
import { correlateAlerts, Alert } from '../../src/mcp_servers/health_monitor/alert_correlator';
import { MetricPoint } from '../../src/mcp_servers/health_monitor/anomaly_detector';

describe('Health Monitor - Anomaly Detection', () => {
  it('should detect anomalies when z-score is > 3', () => {
    const baseValue = 100;
    const metrics: MetricPoint[] = [];
    const timestamp = Date.now();

    // Generate normal data
    // We need enough points for stats. detectAnomalies checks last 10 points.
    // And windowSize defaults to 100.

    for (let i = 0; i < 90; i++) {
      metrics.push({
        agent: 'test-agent',
        metric: 'latency',
        value: baseValue + (Math.random() * 10 - 5), // 95-105 range roughly
        timestamp: new Date(timestamp - (100 - i) * 1000).toISOString()
      });
    }

    // Add anomaly
    metrics.push({
      agent: 'test-agent',
      metric: 'latency',
      value: 200, // Significant deviation (stddev is approx 2.9, diff is 100, z > 30)
      timestamp: new Date().toISOString()
    });

    const anomalies = detectAnomalies(metrics);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].value).toBe(200);
    expect(anomalies[0].severity).toBe('high');
  });

  it('should not detect anomalies in normal distribution', () => {
      const metrics: MetricPoint[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < 50; i++) {
          metrics.push({
              agent: 'test-agent',
              metric: 'latency',
              value: 100 + (Math.random() * 5),
              timestamp: new Date(timestamp - i * 1000).toISOString()
          });
      }

      const anomalies = detectAnomalies(metrics);
      expect(anomalies).toHaveLength(0);
  });
});

describe('Health Monitor - Metric Prediction', () => {
    it('should predict increasing trend', () => {
        const metrics: MetricPoint[] = [];
        const now = Date.now();

        // y = x + 10
        // We simulate data increasing by 1 every minute
        for(let i=0; i<20; i++) {
            metrics.push({
                agent: 'test-agent',
                metric: 'queue_depth',
                value: 10 + i,
                timestamp: new Date(now + i * 60000).toISOString()
            });
        }

        const predictions = predictMetrics(metrics, 10);
        expect(predictions).toHaveLength(1);
        expect(predictions[0].trend).toBe('increasing');
        // Slope is roughly 1. Horizon is 10 mins.
        // Last point x (minutes from start) is 19. Value is 29.
        // Future x is 29. Predicted y should be ~39.

        expect(predictions[0].predicted_value).toBeGreaterThan(38);
        expect(predictions[0].predicted_value).toBeLessThan(40);
    });
});

describe('Health Monitor - Alert Correlation', () => {
    it('should correlate alerts within time window', () => {
        const now = Date.now();
        const alerts: Alert[] = [
            {
                metric: 'cpu',
                message: 'CPU high',
                timestamp: new Date(now).toISOString()
            },
            {
                metric: 'memory',
                message: 'Memory high',
                timestamp: new Date(now + 1000).toISOString() // 1 sec later
            },
            {
                metric: 'disk',
                message: 'Disk full',
                timestamp: new Date(now + 1000 * 60 * 10).toISOString() // 10 mins later
            }
        ];

        const incidents = correlateAlerts(alerts);
        expect(incidents).toHaveLength(2);

        // First incident should have 2 alerts
        expect(incidents[0].alerts).toHaveLength(2);
        expect(incidents[0].severity).toBe('low'); // < 3 alerts

        // Second incident should have 1 alert
        expect(incidents[1].alerts).toHaveLength(1);
    });
});
