# Health Monitor MCP Server

The `health_monitor` server provides real-time tracking of operational metrics, health reporting, and configurable alerting for the Simple CLI agent.

## Features

- **Metric Tracking**: Logs performance metrics (latency, error rates, token usage) to `metrics/{YYYY-MM-DD}.ndjson`.
- **Health Reporting**: Aggregates metrics for specific timeframes (hour, day, week).
- **Alerting System**:
    - Configurable rules with thresholds and operators.
    - Real-time evaluation of metrics against rules.
    - **Persistence**: Alerts are saved to `.agent/health/alerts.json`.
    - **Escalation**: Warning alerts automatically escalate to **CRITICAL** if unresolved for 5 minutes.
    - **Notifications**: Supports logging to console and stubs for Slack/Email integrations.

## Tools

### `track_metric`
Logs a new metric and triggers alert checks.
- **Arguments**: `agent` (source), `metric` (name), `value` (number), `tags` (optional).
- **Example**: `track_metric(agent="llm", metric="latency", value=1500)`

### `get_health_report`
Generates a statistical summary of metrics.
- **Arguments**: `timeframe` ("last_hour", "last_day", "last_week").

### `alert_on_threshold`
Configures a new alert rule.
- **Arguments**: `metric`, `threshold`, `operator` (">", "<", etc.), `contact` (optional webhook/email).
- **Example**: `alert_on_threshold(metric="latency", threshold=2000, operator=">", contact="slack:https://hooks.slack.com/...")`

### `get_active_alerts`
Returns a list of currently active (unresolved) alerts.

### `resolve_alert`
Mark an alert as resolved.
- **Arguments**: `id` (alert ID).

### `check_alerts`
(Legacy/Manual) Forces a check of metrics and returns active alerts.

## Configuration

### Alert Rules
Stored in `.agent/health/alert_rules.json`.
Format:
```json
[
  {
    "id": "uuid",
    "metric": "latency",
    "threshold": 1000,
    "operator": ">",
    "contact": "slack:...",
    "severity": "warning",
    "created_at": "..."
  }
]
```

### Active Alerts
Stored in `.agent/health/alerts.json`.
Format:
```json
[
  {
    "id": "uuid",
    "rule_id": "...",
    "metric": "latency",
    "value": 1500,
    "status": "active",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

## Escalation Policy
The system runs a background job every 60 seconds to check for stale warnings.
- **Condition**: Alert status is `active` and `created_at` is older than 5 minutes.
- **Action**: Status changes to `critical` and a notification is re-sent with `[ESCALATED]` tag.
