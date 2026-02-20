import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logMetric } from "../../logger.js";
import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

const AGENT_DIR = join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');
const ALERT_RULES_FILE = join(process.cwd(), 'scripts', 'dashboard', 'alert_rules.json');

const server = new McpServer({
  name: "health_monitor",
  version: "1.0.0"
});

// Helper to get files for a range of dates
async function getMetricFiles(days: number): Promise<string[]> {
  if (!existsSync(METRICS_DIR)) return [];
  const files = await readdir(METRICS_DIR);
  // Filter for YYYY-MM-DD.ndjson
  const sorted = files.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)).sort();
  return sorted.slice(-days).map(f => join(METRICS_DIR, f));
}

// Helper to read ndjson
async function readNdjson(filepath: string): Promise<any[]> {
  try {
    const content = await readFile(filepath, 'utf-8');
    return content.trim().split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

server.tool(
  "track_metric",
  "Log a performance metric or operational event.",
  {
    agent: z.string().describe("Source of the metric (e.g., 'llm', 'scheduler')"),
    metric: z.string().describe("Name of the metric (e.g., 'latency', 'error_count')"),
    value: z.number().describe("Numerical value of the metric"),
    tags: z.record(z.string()).optional().describe("Optional tags for filtering")
  },
  async ({ agent, metric, value, tags }) => {
    await logMetric(agent, metric, value, tags || {});
    return { content: [{ type: "text", text: `Metric ${metric} tracked.` }] };
  }
);

server.tool(
  "get_health_report",
  "Generate a health report aggregating metrics for a specific timeframe.",
  {
    timeframe: z.enum(["last_hour", "last_day", "last_week"]).describe("Timeframe for the report")
  },
  async ({ timeframe }) => {
    let days = 1;
    if (timeframe === "last_week") days = 7;

    const files = await getMetricFiles(days);
    let allMetrics: any[] = [];
    for (const file of files) {
      allMetrics = allMetrics.concat(await readNdjson(file));
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

    // Aggregate
    const report: Record<string, { count: number, min: number, max: number, avg: number, sum: number }> = {};

    for (const m of allMetrics) {
      const key = `${m.agent}:${m.metric}`;
      if (!report[key]) {
        report[key] = { count: 0, min: m.value, max: m.value, avg: 0, sum: 0 };
      }
      const r = report[key];
      r.count++;
      r.sum += m.value;
      r.min = Math.min(r.min, m.value);
      r.max = Math.max(r.max, m.value);
    }

    for (const key in report) {
      report[key].avg = report[key].sum / report[key].count;
    }

    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  }
);

server.tool(
  "alert_on_threshold",
  "Configure an alert rule for a specific metric.",
  {
    metric: z.string(),
    threshold: z.number(),
    operator: z.enum([">", "<", ">=", "<=", "=="]),
    contact: z.string().optional().describe("Webhook URL or channel (e.g. slack)")
  },
  async ({ metric, threshold, operator, contact }) => {
     let rules: any[] = [];
     if (existsSync(ALERT_RULES_FILE)) {
        try {
            rules = JSON.parse(await readFile(ALERT_RULES_FILE, 'utf-8'));
        } catch {}
     } else {
        const dir = dirname(ALERT_RULES_FILE);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
     }

     rules.push({ metric, threshold, operator, contact, created_at: new Date().toISOString() });
     await writeFile(ALERT_RULES_FILE, JSON.stringify(rules, null, 2));

     return { content: [{ type: "text", text: `Alert rule added for ${metric} ${operator} ${threshold}` }] };
  }
);

server.tool(
  "check_alerts",
  "Check current metrics against configured alert rules.",
  {},
  async () => {
    if (!existsSync(ALERT_RULES_FILE)) {
         return { content: [{ type: "text", text: "No alert rules configured." }] };
    }

    let rules: any[] = [];
    try {
        rules = JSON.parse(await readFile(ALERT_RULES_FILE, 'utf-8'));
    } catch {
        return { content: [{ type: "text", text: "Failed to parse alert rules." }] };
    }

    // Get last hour metrics for checking
    const files = await getMetricFiles(1);
    let metrics: any[] = [];
    if (files.length > 0) {
        metrics = await readNdjson(files[files.length - 1]);
    }

    // Check against average of last 5 mins
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const recentMetrics = metrics.filter(m => (now - new Date(m.timestamp).getTime()) < fiveMinutes);

    const alerts: string[] = [];

    for (const rule of rules) {
        const relevant = recentMetrics.filter(m =>
            m.metric === rule.metric || `${m.agent}:${m.metric}` === rule.metric
        );

        if (relevant.length === 0) continue;

        const avgValue = relevant.reduce((sum, m) => sum + m.value, 0) / relevant.length;

        let triggered = false;
        if (rule.operator === ">" && avgValue > rule.threshold) triggered = true;
        if (rule.operator === "<" && avgValue < rule.threshold) triggered = true;
        if (rule.operator === ">=" && avgValue >= rule.threshold) triggered = true;
        if (rule.operator === "<=" && avgValue <= rule.threshold) triggered = true;

        if (triggered) {
            const msg = `ALERT: ${rule.metric} is ${avgValue.toFixed(2)} (${rule.operator} ${rule.threshold})`;
            alerts.push(msg);
            console.error(msg);
        }
    }

    if (alerts.length > 0) {
        return { content: [{ type: "text", text: alerts.join("\n") }] };
    }

    return { content: [{ type: "text", text: "No alerts triggered." }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
