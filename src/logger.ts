import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

function getMetricsDir() {
  return join(process.cwd(), '.agent', 'metrics');
}

// Ensure directory exists
let dirChecked = false;

async function ensureMetricsDir() {
  // Always check logic if path can change (e.g. testing), but optimizing for "checked once per run" is fine usually.
  // However, in tests process.cwd() changes. So dirChecked=true might be stale if cwd changes?
  // But usually cwd changes once per test setup.
  // To be safe in tests, we should re-check if path changed?
  // Or just rely on mkdir recursive which is fast.
  const dir = getMetricsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
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

    const date = new Date().toISOString().split('T')[0];
    const filename = join(getMetricsDir(), `${date}.ndjson`);

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
