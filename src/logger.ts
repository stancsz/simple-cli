import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Ensure directory exists
async function ensureMetricsDir() {
  const metricsDir = join(process.cwd(), '.agent', 'metrics');
  if (!existsSync(metricsDir)) {
    await mkdir(metricsDir, { recursive: true });
  }
}

export interface MetricTags {
  [key: string]: string | number | boolean;
}

/**
 * Log a structured metric to the daily ndjson file.
 * This function is non-blocking (async) and fails silently on error to prevent app crashes.
 *
 * @param agent - The source of the metric (e.g., 'llm', 'mcp', 'scheduler')
 * @param metric - The name of the metric (e.g., 'latency', 'tokens')
 * @param value - The numerical value of the metric
 * @param tags - Optional key-value pairs for filtering/aggregation
 */
export async function logMetric(
  agent: string,
  metric: string,
  value: number,
  tags: MetricTags = {}
) {
  try {
    await ensureMetricsDir();

    const metricsDir = join(process.cwd(), '.agent', 'metrics');
    const date = new Date().toISOString().split('T')[0];
    const filename = join(metricsDir, `${date}.ndjson`);

    const entry = {
      timestamp: new Date().toISOString(),
      agent,
      metric,
      value,
      tags
    };

    await appendFile(filename, JSON.stringify(entry) + '\n');
  } catch (error) {
    // Fail silently to avoid crashing the application, but log to stderr for debugging
    console.error(`[Metrics] Failed to write metric ${metric}:`, error);
  }
}
