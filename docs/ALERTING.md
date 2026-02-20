# Production Alerting System

The Health Monitor MCP server includes a robust alerting system to track critical metrics and notify you when thresholds are breached.

## Features
- **Configurable Rules**: Define rules based on metric name, threshold, and operator.
- **Multiple Channels**: Support for Slack and Generic Webhooks.
- **Dashboard Integration**: View active alerts and configured rules in the Health Dashboard.
- **Safety**: Alerting is disabled by default in safe mode (`yoloMode: false`) unless explicitly enabled.

## Configuration

Alert rules are stored in `.agent/health/alert_rules.json`.

### Enabling Alerts
To enable alerts in production (safe mode), update `.agent/config.json`:

```json
{
  "yoloMode": false,
  "enable_alerts": true
}
```

### Creating Rules via MCP
You can use the `create_alert_rule` tool:

```json
{
  "metric": "llm_latency",
  "threshold": 2000,
  "operator": ">",
  "channel": {
    "type": "slack",
    "target": "https://hooks.slack.com/services/..."
  }
}
```

### Dashboard
Run the dashboard to monitor alerts:
```bash
node scripts/dashboard/server.js
```
Visit `http://localhost:3003`.
