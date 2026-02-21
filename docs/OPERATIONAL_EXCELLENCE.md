# Operational Excellence: Production Monitoring & Alerting

Simple-CLI includes a production-grade observability system designed for Kubernetes deployments.

## Architecture

- **Metrics Collection**: All agent components (LLM, Tools, Scheduler) emit structured logs to `.agent/metrics/{YYYY-MM-DD}.ndjson`.
- **Health Monitor MCP**: A sidecar process (or standalone server) that aggregates metrics and evaluates alert rules.
- **Dashboard**: A lightweight web UI for visualizing real-time metrics and alert history.
- **Alert Manager**: Dispatches notifications via Slack or Teams when thresholds are breached.

## Dashboard

The dashboard provides real-time visibility into:
- LLM Latency & Token Usage
- Error Rates
- Recent Alerts

**Access:**
- Local: `http://localhost:3004/dashboard` (if port forwarding)
- Kubernetes: Port-forward the `health-monitor` port (default 3004).
  ```bash
  kubectl port-forward service/simple-cli-agent 3004:3004
  ```
  Then visit `http://localhost:3004/dashboard`.

## Alert Configuration

Alerts are defined in `.agent/alert_rules.json`. You can manage them using the `health_monitor` MCP tools.

### Adding an Alert Rule
Use the `alert_on_threshold` tool:
```json
{
  "metric": "llm_latency",
  "threshold": 5000,
  "operator": ">",
  "contact": "slack:#alerts"
}
```

### Supported Contact Channels
- **Slack**: `slack:#channel` (Requires `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`)
- **Webhooks**: `https://hooks.slack.com/...` or MS Teams Webhook URL.

## Metrics Interpretation

- `llm_latency`: Time in ms for LLM to generate a response. High latency (>5s) might indicate model congestion or complex prompts.
- `llm_tokens_total`: Total tokens consumed. useful for cost tracking.
- `llm_error`: Count of failed LLM calls.
- `tool_error`: Count of failed tool executions.

## Production Hardening

- **Persistence**: Metrics and rules are stored in the `.agent` volume, ensuring they survive pod restarts.
- **Isolation**: Health Monitor runs as a sidecar, minimizing impact on the main agent process.
- **Resilience**: File-based logging ensures data is preserved even if the monitor crashes.
