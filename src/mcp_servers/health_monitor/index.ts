import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { join } from "path";
import { MetricsCollector } from "./metrics_collector.js";
import { AlertManager } from "./alert_manager.js";

const server = new McpServer({
  name: "health_monitor",
  version: "1.0.0"
});

const metricsCollector = new MetricsCollector();
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
    await metricsCollector.track(agent, metric, value, tags);
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
    const metrics = await metricsCollector.getMetrics(timeframe as any);

    // Aggregate
    const report: Record<string, { count: number, min: number, max: number, avg: number, sum: number }> = {};

    for (const m of metrics) {
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
     await alertManager.addRule({
         metric,
         threshold,
         operator: operator as any,
         contact,
         created_at: new Date().toISOString()
     });

     return { content: [{ type: "text", text: `Alert rule added for ${metric} ${operator} ${threshold}` }] };
  }
);

server.tool(
  "check_alerts",
  "Check current metrics against configured alert rules.",
  {},
  async () => {
    const metrics = await metricsCollector.getMetrics('last_hour'); // Check last hour metrics
    const alerts = await alertManager.checkAlerts(metrics);

    if (alerts.length > 0) {
        return { content: [{ type: "text", text: alerts.join("\n") }] };
    }

    return { content: [{ type: "text", text: "No alerts triggered." }] };
  }
);

async function main() {
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

    // API for Dashboard
    app.get("/api/metrics", async (req, res) => {
        const timeframe = (req.query.timeframe as any) || 'last_hour';
        try {
            const metrics = await metricsCollector.getMetrics(timeframe);
            res.json(metrics);
        } catch (e) {
            res.status(500).json({ error: "Failed to fetch metrics" });
        }
    });

    app.get("/api/alerts", async (req, res) => {
        try {
            const alerts = await alertManager.getAlertHistory();
            res.json(alerts);
        } catch (e) {
            res.status(500).json({ error: "Failed to fetch alerts" });
        }
    });

    // Serve Dashboard Static Files
    const dashboardPath = join(process.cwd(), 'scripts', 'dashboard');
    app.use('/dashboard', express.static(dashboardPath));

    // Redirect /dashboard to /dashboard/index.html explicitly if needed, but express.static usually handles index.html

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
