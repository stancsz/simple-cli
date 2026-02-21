# Operational Excellence & Monitoring Guide

## Overview

Simple CLI now includes a production-grade Health Monitor MCP server that provides real-time visibility into agent performance and costs. This system tracks metrics, generates health reports, and sends proactive alerts via Slack or other webhooks.

## 1. Metrics Collection

The system automatically collects the following metrics in `.agent/metrics/`:

*   **LLM Performance**:
    *   `llm_latency`: Time taken for LLM generation and embedding (ms).
    *   `llm_tokens_total`, `llm_tokens_prompt`, `llm_tokens_completion`: Token usage.
    *   `llm_error`: Count of LLM failures.
*   **Task Execution**:
    *   `task_duration`: Execution time for scheduled tasks (ms).
    *   `task_outcome`: Success (1) or Failure (0) count.
*   **Tool Usage**:
    *   `tool_execution_time`: Duration of tool calls (ms).
    *   `tool_success`, `tool_error`: Tool execution outcomes.

## 2. Setting Up Alerts

The Health Monitor can send alerts to Slack or any webhook-compatible service when metrics breach defined thresholds.

### Step 1: Configure Webhook URL

Set the `SLACK_WEBHOOK_URL` environment variable in your `.env` file or deployment configuration:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Alternatively, you can specify a unique webhook URL for each alert rule.

### Step 2: Define Alert Rules

You can configure alerts using the `alert_on_threshold` tool via the CLI or by editing `scripts/dashboard/alert_rules.json` directly.

**Example Rule (JSON):**

```json
[
  {
    "metric": "error_rate",
    "threshold": 5,
    "operator": ">",
    "contact": "https://hooks.slack.com/services/...",
    "created_at": "2023-10-27T10:00:00.000Z"
  },
  {
    "metric": "llm_tokens_total",
    "threshold": 100000,
    "operator": ">",
    "created_at": "2023-10-27T10:00:00.000Z"
  }
]
```

### Step 3: Enable Health Checks

The Scheduler automatically runs an **Hourly Health Check** task (`health-check`) that triggers the `check_alerts` tool. This tool evaluates the last hour's metrics against your rules and sends alerts if thresholds are met.

## 3. Viewing Health Reports

You can generate an ad-hoc health report using the `get_health_report` tool:

```bash
# Get a summary of the last 24 hours
simple run --tool get_health_report --args '{"timeframe": "last_day"}'
```

## 4. Troubleshooting

*   **Alerts not sending?** Check the `SLACK_WEBHOOK_URL` and ensure the container/process has internet access. Check `.agent/logs/` for `[HealthMonitor]` errors.
*   **Missing metrics?** Verify that `.agent/metrics/` is writable and that the agent has permission to write to it.

## 5. Maintenance

Metrics are stored as daily NDJSON files in `.agent/metrics/`. You may want to configure a log rotation policy or a cron job to archive/delete old metric files to save space (e.g., keep last 30 days).
