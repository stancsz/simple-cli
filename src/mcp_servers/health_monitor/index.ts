import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logMetric } from "../../logger.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { EpisodicMemory } from "../../brain/episodic.js";
import { loadConfig } from "../../config.js";
import { getMetricFiles, readNdjson, AGENT_DIR, METRICS_DIR } from "./utils.js";
import { detectAnomalies, predictMetrics } from "./anomaly_detector.js";
import { correlateAlerts, Alert } from "./alert_correlator.js";

const ALERT_RULES_FILE = join(process.cwd(), 'scripts', 'dashboard', 'alert_rules.json');

const server = new McpServer({
  name: "health_monitor",
  version: "1.0.0"
});

const episodic = new EpisodicMemory();

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

async function getAlerts(): Promise<Alert[]> {
    if (!existsSync(ALERT_RULES_FILE)) {
         return [];
    }

    let rules: any[] = [];
    try {
        rules = JSON.parse(await readFile(ALERT_RULES_FILE, 'utf-8'));
    } catch {
        return [];
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

    const alerts: Alert[] = [];

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
            alerts.push({
                metric: rule.metric,
                message: `${rule.metric} is ${avgValue.toFixed(2)} (${rule.operator} ${rule.threshold})`,
                timestamp: new Date().toISOString()
            });
        }
    }
    return alerts;
}

server.tool(
  "check_alerts",
  "Check current metrics against configured alert rules.",
  {},
  async () => {
    const alerts = await getAlerts();
    if (alerts.length > 0) {
        return { content: [{ type: "text", text: alerts.map(a => `ALERT: ${a.message}`).join("\n") }] };
    }
    return { content: [{ type: "text", text: "No alerts triggered." }] };
  }
);

server.tool(
  "detect_anomalies",
  "Detect statistical anomalies in metrics.",
  {
      agent: z.string().optional(),
      metric: z.string().optional()
  },
  async ({ agent, metric }) => {
      const files = await getMetricFiles(1);
      let metrics: any[] = [];
      for (const file of files) {
          metrics = metrics.concat(await readNdjson(file));
      }

      if (agent) metrics = metrics.filter(m => m.agent === agent);
      if (metric) metrics = metrics.filter(m => m.metric === metric);

      const anomalies = detectAnomalies(metrics);
      return { content: [{ type: "text", text: JSON.stringify(anomalies, null, 2) }] };
  }
);

server.tool(
  "get_correlated_alerts",
  "Get correlated alert incidents.",
  {},
  async () => {
      const alerts = await getAlerts();
      const incidents = correlateAlerts(alerts);
      return { content: [{ type: "text", text: JSON.stringify(incidents, null, 2) }] };
  }
);

server.tool(
  "predict_metrics",
  "Predict future metric values.",
  {
      metric: z.string(),
      horizon_minutes: z.number().default(60)
  },
  async ({ metric, horizon_minutes }) => {
       const files = await getMetricFiles(7); // Use last week for prediction context
       let metrics: any[] = [];
       for (const file of files) {
           metrics = metrics.concat(await readNdjson(file));
       }

       // Filter by metric name or agent:metric
       metrics = metrics.filter(m => m.metric === metric || `${m.agent}:${m.metric}` === metric);

       const predictions = predictMetrics(metrics, horizon_minutes);
       return { content: [{ type: "text", text: JSON.stringify(predictions, null, 2) }] };
  }
);

async function aggregateCompanyMetrics() {
    // AGENT_DIR is .../.agent
    // We want the parent of .agent to be the cwd for loadConfig
    const config = await loadConfig(dirname(AGENT_DIR));
    const companies = config.companies || [];
    const metrics: Record<string, any> = {};

    for (const company of companies) {
        try {
            const episodes = await episodic.getRecentEpisodes(company, 100);

            let totalTokens = 0;
            let totalDuration = 0;
            let successCount = 0;
            let failCount = 0;

            for (const ep of episodes) {
                totalTokens += ep.tokens || 0;
                totalDuration += ep.duration || 0;

                const isFailure = (ep.agentResponse || "").toLowerCase().includes("outcome: failure") ||
                                  (ep.agentResponse || "").toLowerCase().includes("outcome: failed");
                if (isFailure) failCount++;
                else successCount++;
            }

            const count = episodes.length;
            const avgDuration = count > 0 ? totalDuration / count : 0;
            const successRate = count > 0 ? (successCount / count) * 100 : 0;
            const estimatedCost = (totalTokens / 1_000_000) * 5.00; // $5 per 1M tokens assumption

            metrics[company] = {
                total_tokens: totalTokens,
                avg_duration_ms: Math.round(avgDuration),
                success_rate: Math.round(successRate),
                task_count: count,
                estimated_cost_usd: parseFloat(estimatedCost.toFixed(4))
            };
        } catch (e) {
            console.error(`Failed to get metrics for ${company}:`, e);
            metrics[company] = { error: (e as Error).message };
        }
    }
    return metrics;
}

server.tool(
  "get_company_metrics",
  "Aggregate metrics per company from the Brain.",
  {},
  async () => {
      const data = await aggregateCompanyMetrics();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Helper to connect to Operational Persona
async function connectToOperationalPersona(): Promise<Client | null> {
    const srcPath = join(process.cwd(), "src", "mcp_servers", "operational_persona", "index.ts");
    const distPath = join(process.cwd(), "dist", "mcp_servers", "operational_persona", "index.js");

    let command = "node";
    let args = [distPath];

    if (existsSync(srcPath) && !existsSync(distPath)) {
        command = "npx";
        args = ["tsx", srcPath];
    } else if (!existsSync(distPath)) {
        console.warn("Could not find Operational Persona server script.");
        return null;
    }

    const env: Record<string, string> = {};
    for (const key in process.env) {
        const val = process.env[key];
        if (val !== undefined && key !== 'PORT') {
            env[key] = val;
        }
    }
    env.MCP_DISABLE_DEPENDENCIES = 'true';

    const transport = new StdioClientTransport({
        command,
        args,
        env
    });

    const client = new Client(
        { name: "health-monitor-client", version: "1.0.0" },
        { capabilities: {} }
    );

    try {
        await client.connect(transport);
        return client;
    } catch (e) {
        console.error("Failed to connect to Operational Persona:", e);
        return null;
    }
}

export async function main() {
  if (process.env.PORT) {
    const app = express();
    const transport = new StreamableHTTPServerTransport();
    await server.connect(transport);

    // Connect to Operational Persona Client
    const personaClient = await connectToOperationalPersona();

    // Serve Dashboard Static Files
    const dashboardPublic = join(process.cwd(), 'scripts', 'dashboard', 'dist');
    if (existsSync(dashboardPublic)) {
        app.use(express.static(dashboardPublic));
    } else {
        // Fallback for dev/test environments where build hasn't run
        console.warn("Dashboard dist not found, serving source for testing...");
        app.use(express.static(join(process.cwd(), 'scripts', 'dashboard')));
    }

    app.all("/sse", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.post("/messages", async (req, res) => {
      await transport.handleRequest(req, res);
    });

    app.get("/health", (req, res) => {
      res.sendStatus(200);
    });

    app.get("/api/dashboard/metrics", async (req, res) => {
        try {
            const data = await aggregateCompanyMetrics();
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    app.get("/api/dashboard/alerts", async (req, res) => {
        try {
            const alerts = await getAlerts();
            res.json({ alerts: alerts.map(a => a.message) }); // Backward compatibility for string array
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    app.get("/api/dashboard/incidents", async (req, res) => {
        try {
            const alerts = await getAlerts();
            const incidents = correlateAlerts(alerts);
            res.json(incidents);
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    app.get("/api/dashboard/anomalies", async (req, res) => {
        try {
             const files = await getMetricFiles(1);
             let metrics: any[] = [];
             for (const file of files) {
                  metrics = metrics.concat(await readNdjson(file));
             }
             const anomalies = detectAnomalies(metrics);
             res.json(anomalies);
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    app.get("/api/dashboard/predictions", async (req, res) => {
        const metric = req.query.metric as string;
        if (!metric) return res.status(400).json({ error: "metric query param required" });
        try {
             const files = await getMetricFiles(7);
             let metrics: any[] = [];
             for (const file of files) {
                  metrics = metrics.concat(await readNdjson(file));
             }
             metrics = metrics.filter(m => m.metric === metric || `${m.agent}:${m.metric}` === metric);
             const predictions = predictMetrics(metrics, 60);
             res.json(predictions);
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    // Alias for backward compatibility
    app.get("/api/metrics", async (req, res) => {
        try {
            const data = await aggregateCompanyMetrics();
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: (e as Error).message });
        }
    });

    app.get("/api/dashboard/summary", async (req, res) => {
        if (!personaClient) {
            return res.status(503).json({ error: "Operational Persona service unavailable" });
        }
        try {
            const metrics = await aggregateCompanyMetrics();
            const alerts = await getAlerts();

            const activity = {
                summary: "See dashboard for details.",
                alerts: alerts
            };

            const result: any = await personaClient.callTool({
                name: "generate_dashboard_summary",
                arguments: {
                    metrics: JSON.stringify(metrics),
                    activity: JSON.stringify(activity)
                }
            });

            if (result.content && result.content[0] && result.content[0].text) {
                res.json({ summary: result.content[0].text });
            } else {
                res.status(500).json({ error: "Failed to generate summary" });
            }
        } catch (e) {
            console.error("Summary generation failed:", e);
            res.status(500).json({ error: (e as Error).message });
        }
    });

    const port = process.env.PORT;
    const httpServer = app.listen(port, () => {
      console.error(`Health Monitor MCP Server running on http://localhost:${port}/sse`);
      console.error(`Dashboard available at http://localhost:${port}/`);
    });
    return httpServer;
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return null;
  }
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
}
