# Health Monitoring & Dashboard

Simple-CLI now includes a production-grade monitoring system that tracks agent performance, token usage, and error rates.

## Architecture

The monitoring system consists of three components:
1.  **Metric Collection**: Core components (`llm.ts`, `engine.ts`, `mcp.ts`) emit structured logs to `.agent/metrics/{YYYY-MM-DD}.ndjson`.
2.  **Health Monitor MCP Server**: Aggregates these logs and checks for anomalies.
3.  **Dashboard**: A lightweight web interface to visualize the metrics.

## Components

### Health Monitor MCP Server
Located in `src/mcp_servers/health_monitor/`, this server exposes tools to:
- `track_metric`: Log new metrics.
- `get_health_report`: aggregated stats (min, max, avg).
- `check_alerts`: Check configured thresholds.
- `alert_on_threshold`: Configure new alerts.

### Dashboard
Located in `scripts/dashboard/`, run with `node scripts/dashboard/server.js`.
- Port: 3003 (default)
- URL: `http://localhost:3003`

## Usage

### Viewing the Dashboard
```bash
node scripts/dashboard/server.js
# Open http://localhost:3003 in your browser
```

### Configuring Alerts
You can configure alerts using the `alert_on_threshold` tool (via CLI) or by editing `scripts/dashboard/alert_rules.json`.

Example Rule:
```json
{
  "metric": "llm_latency",
  "threshold": 5000,
  "operator": ">",
  "contact": "slack_webhook_url"
}
```

### Metrics Tracked
- `llm_latency`: Time taken for LLM generation (ms).
- `llm_tokens_total`, `llm_tokens_prompt`, `llm_tokens_completion`.
- `llm_error`: Count of LLM failures.
- `tool_execution_time`: Duration of tool execution.
- `tool_error`, `tool_success`: Tool reliability.

## Deployment
In production, the dashboard can be run alongside the agent container or as a separate service mapping the `.agent/metrics` volume.
