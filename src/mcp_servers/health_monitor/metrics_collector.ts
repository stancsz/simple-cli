import { logMetric } from "../../logger.js";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export interface Metric {
    timestamp: string;
    agent: string;
    metric: string;
    value: number;
    tags?: Record<string, any>;
}

export class MetricsCollector {
    private metricsDir: string;

    constructor(baseDir: string = process.cwd()) {
        const agentDir = join(baseDir, '.agent');
        this.metricsDir = join(agentDir, 'metrics');
    }

    /**
     * Log a metric.
     */
    async track(agent: string, metric: string, value: number, tags?: Record<string, any>) {
        await logMetric(agent, metric, value, tags || {});
    }

    /**
     * Get aggregated metrics for a specific timeframe.
     */
    async getMetrics(timeframe: 'last_hour' | 'last_day' | 'last_week'): Promise<Metric[]> {
        let days = 1;
        if (timeframe === "last_week") days = 7;

        const files = await this.getMetricFiles(days);
        let allMetrics: Metric[] = [];
        for (const file of files) {
            allMetrics = allMetrics.concat(await this.readNdjson(file));
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;

        // Filter by time
        if (timeframe === "last_hour") {
            allMetrics = allMetrics.filter(m => (now - new Date(m.timestamp).getTime()) < oneHour);
        } else if (timeframe === "last_day") {
            allMetrics = allMetrics.filter(m => (now - new Date(m.timestamp).getTime()) < oneDay);
        }

        return allMetrics;
    }

    private async getMetricFiles(days: number): Promise<string[]> {
        if (!existsSync(this.metricsDir)) return [];
        const files = await readdir(this.metricsDir);
        // Filter for YYYY-MM-DD.ndjson
        const sorted = files.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
        return sorted.slice(-days).map(f => join(this.metricsDir, f));
    }

    private async readNdjson(filepath: string): Promise<Metric[]> {
        try {
            const content = await readFile(filepath, 'utf-8');
            return content.trim().split('\n').map(line => {
                try { return JSON.parse(line); } catch { return null; }
            }).filter(Boolean);
        } catch {
            return [];
        }
    }
}
