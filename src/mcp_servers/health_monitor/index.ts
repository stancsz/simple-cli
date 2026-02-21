import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { logMetric } from "../../logger.js";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { AlertManager } from "./alert_manager.js";

const AGENT_DIR = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
const METRICS_DIR = join(AGENT_DIR, 'metrics');

const server = new McpServer({
  name: "health_monitor",
  version: "1.0.0"
});

const alertManager = new AlertManager(AGENT_DIR);

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

    // Check alerts asynchronously to not block
    alertManager.checkMetric(metric, value).catch(err => console.error("Error checking alert:", err));
    alertManager.checkMetric(`${agent}:${metric}`, value).catch(err => console.error("Error checking alert:", err));

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
    contact: z.string().optional().describe("Webhook URL or channel (e.g. slack:https://...)")
  },
  async ({ metric, threshold, operator, contact }) => {
     await alertManager.addRule(metric, threshold, operator, contact);
     return { content: [{ type: "text", text: `Alert rule added for ${metric} ${operator} ${threshold}` }] };
  }
);

server.tool(
  "get_active_alerts",
  "Get a list of currently active (unresolved) alerts.",
  {},
  async () => {
    const alerts = alertManager.getActiveAlerts();
    if (alerts.length === 0) {
        return { content: [{ type: "text", text: "No active alerts." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(alerts, null, 2) }] };
  }
);

server.tool(
  "resolve_alert",
  "Resolve an active alert by ID.",
  {
    id: z.string().describe("ID of the alert to resolve")
  },
  async ({ id }) => {
    const success = await alertManager.resolveAlert(id);
    if (success) {
        return { content: [{ type: "text", text: `Alert ${id} resolved.` }] };
    }
    return { content: [{ type: "text", text: `Alert ${id} not found or already resolved.` }] };
  }
);

server.tool(
  "check_alerts",
  "Force a check of metrics against rules and return active alerts.",
  {},
  async () => {
    // Note: Alerts are now checked in real-time on track_metric and via background escalation.
    // This tool now mainly serves to view status, similar to get_active_alerts.
    const alerts = alertManager.getActiveAlerts();
    if (alerts.length > 0) {
        const lines = alerts.map(a => `[${a.status.toUpperCase()}] ${a.metric}: ${a.value} (${a.operator} ${a.threshold})`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
    }
    return { content: [{ type: "text", text: "No alerts triggered." }] };
  }
);

async function main() {
  await alertManager.init();

  // Start background escalation check (every 60s)
  setInterval(() => {
    alertManager.checkEscalation().catch(err => console.error("Escalation check failed:", err));
  }, 60000);

  if (process.env.PORT) {
    const app = express();
    const transport = new StreamableHTTPServerTransport();
    await server.connect(transport);

    app.all("/sse", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.post("/messages", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.get("/health", (req, res) => {
      res.sendStatus(200);
    });

    const port = process.env.PORT;
    app.listen(port, () => {
      console.error(`Health Monitor MCP Server running on http://localhost:${port}/sse`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
