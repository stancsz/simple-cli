import { z } from "zod";

export interface MetricPoint {
    agent: string;
    metric: string;
    value: number;
    timestamp: string;
    tags?: Record<string, string>;
}

export interface Anomaly {
    agent: string;
    metric: string;
    value: number;
    timestamp: string;
    z_score: number;
    mean: number;
    std_dev: number;
    severity: "low" | "medium" | "high";
}

export function detectAnomalies(metrics: MetricPoint[], windowSize: number = 100): Anomaly[] {
    const grouped: Record<string, MetricPoint[]> = {};

    // Group by agent:metric
    for (const m of metrics) {
        const key = `${m.agent}:${m.metric}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
    }

    const anomalies: Anomaly[] = [];

    for (const key in grouped) {
        const points = grouped[key].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // We need at least a few points to calculate stats
        if (points.length < 5) continue;

        // Check the last 10 points for anomalies based on the window preceding them.
        const checkCount = Math.min(10, points.length);

        for (let i = points.length - checkCount; i < points.length; i++) {
             const current = points[i];
             const windowStart = Math.max(0, i - windowSize);
             const window = points.slice(windowStart, i);

             if (window.length < 5) continue;

             const values = window.map(p => p.value);
             const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
             const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
             const stdDev = Math.sqrt(variance);

             if (stdDev === 0) continue;

             const zScore = (current.value - mean) / stdDev;

             if (Math.abs(zScore) > 3) {
                 anomalies.push({
                     agent: current.agent,
                     metric: current.metric,
                     value: current.value,
                     timestamp: current.timestamp,
                     z_score: zScore,
                     mean,
                     std_dev: stdDev,
                     severity: Math.abs(zScore) > 5 ? "high" : "medium"
                 });
             }
        }
    }
    return anomalies;
}

export function predictMetrics(metrics: MetricPoint[], horizonMinutes: number = 60): any[] {
     const grouped: Record<string, MetricPoint[]> = {};

    for (const m of metrics) {
        const key = `${m.agent}:${m.metric}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(m);
    }

    const predictions: any[] = [];

    for (const key in grouped) {
        const points = grouped[key].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (points.length < 10) continue;

        // Linear regression on time vs value
        const n = points.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        const startTime = new Date(points[0].timestamp).getTime();

        // Normalize time to minutes from start
        const data = points.map(p => {
            return {
                x: (new Date(p.timestamp).getTime() - startTime) / 60000,
                y: p.value
            };
        });

        for (const p of data) {
            sumX += p.x;
            sumY += p.y;
            sumXY += p.x * p.y;
            sumXX += p.x * p.x;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        if (isNaN(slope) || isNaN(intercept)) continue;

        const lastTime = data[data.length - 1].x;
        const futureTime = lastTime + horizonMinutes;
        const predictedValue = slope * futureTime + intercept;

        predictions.push({
            metric: key,
            current_value: points[points.length - 1].value,
            predicted_value: predictedValue,
            horizon_minutes: horizonMinutes,
            trend: slope > 0 ? "increasing" : "decreasing"
        });
    }
    return predictions;
}
