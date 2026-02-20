import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const AGENT_DIR = join(process.cwd(), '.agent');
export const METRICS_DIR = join(AGENT_DIR, 'metrics');

// Helper to get files for a range of dates
export async function getMetricFiles(days: number): Promise<string[]> {
  if (!existsSync(METRICS_DIR)) return [];
  const files = await readdir(METRICS_DIR);
  // Filter for YYYY-MM-DD.ndjson
  const sorted = files.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
  return sorted.slice(-days).map(f => join(METRICS_DIR, f));
}

// Helper to read ndjson
export async function readNdjson(filepath: string): Promise<any[]> {
  try {
    const content = await readFile(filepath, 'utf-8');
    return content.trim().split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
