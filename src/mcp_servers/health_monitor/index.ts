import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logMetric } from "../../logger.js";
import { AlertManager, AlertRuleSchema } from "./alerting.js";
import { getMetricFiles, readNdjson } from "./utils.js";

const server = new McpServer({
  name: "health_monitor",
  version: "1.1.0"
});

const alertManager = new AlertManager();

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
  "create_alert_rule",
  "Create a new alert rule.",
  AlertRuleSchema.omit({ id: true, created_at: true }).partial({ enabled: true, window: true }).extend({
    channel: z.object({
        type: z.enum(["slack", "webhook", "email"]),
        target: z.string()
    })
  }),
  async (args) => {
     // @ts-ignore
     const rule = await alertManager.addRule(args);
     return { content: [{ type: "text", text: `Alert rule created: ${rule.metric} ${rule.operator} ${rule.threshold}` }] };
  }
);

server.tool(
  "list_active_alerts",
  "List currently active alerts.",
  {},
  async () => {
    const alerts = await alertManager.getActiveAlerts();
    return { content: [{ type: "text", text: JSON.stringify(alerts, null, 2) }] };
  }
);

server.tool(
  "trigger_test_alert",
  "Trigger a test alert to verify notification channels.",
  {
     metric: z.string(),
     value: z.number()
  },
  async ({ metric, value }) => {
     await logMetric('test', metric, value);
     // Force check immediately
     await alertManager.checkAlerts();
     return { content: [{ type: "text", text: "Test metric logged and alert check triggered." }] };
  }
);

// Deprecated: Kept for backward compatibility but routes to AlertManager
server.tool(
  "alert_on_threshold",
  "Configure an alert rule for a specific metric. (Deprecated: use create_alert_rule)",
  {
    metric: z.string(),
    threshold: z.number(),
    operator: z.enum([">", "<", ">=", "<=", "=="]),
    contact: z.string().optional().describe("Webhook URL or channel (e.g. slack)")
  },
  async ({ metric, threshold, operator, contact }) => {
     const rule = await alertManager.addRule({
         metric,
         threshold,
         operator,
         channel: { type: contact && contact.includes('slack') ? 'slack' : 'webhook', target: contact || 'http://localhost' }
     });
     return { content: [{ type: "text", text: `Alert rule added for ${metric} ${operator} ${threshold}` }] };
  }
);

server.tool(
  "check_alerts",
  "Check current metrics against configured alert rules.",
  {},
  async () => {
    await alertManager.checkAlerts();
    const alerts = await alertManager.getActiveAlerts();
    if (alerts.length > 0) {
         return { content: [{ type: "text", text: alerts.map(a => `ALERT: ${a.metric} is ${a.value}`).join("\n") }] };
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
