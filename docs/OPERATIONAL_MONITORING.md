# Operational Monitoring

This document describes the health monitoring and dashboard system for the agent.

## Architecture

The monitoring system consists of three components:
1.  **Health Monitor MCP Server**: Collects metrics, stores them in `.agent/metrics`, and evaluates alert rules.
2.  **Dashboard**: A lightweight web interface that visualizes metrics in real-time.
3.  **Agent Instrumentation**: The main agent engine and LLM client automatically report metrics to the Health Monitor.

### Metrics Flow
1.  Agent components (Engine, LLM) call `track_metric` MCP tool on the Health Monitor.
2.  Health Monitor appends metrics to daily NDJSON files in `.agent/metrics/`.
3.  Dashboard polls the Health Monitor via `get_metrics` tool.
4.  Health Monitor periodically checks alert rules via `check_alerts` tool (scheduled task).

## Running in Production

To run the full stack with monitoring:

```bash
docker-compose up -d
```

This starts:
-   **Agent**: Port 3002
-   **Health Monitor**: Port 3004 (SSE endpoint: `http://localhost:3004/sse`)
-   **Dashboard**: Port 3003 (UI: `http://localhost:3003`)

## Dashboard

Access the dashboard at `http://localhost:3003`.

The dashboard shows:
-   Latency graphs
-   Token usage
-   Error rates
-   Recent alerts

## Configuration

### Alert Rules
Alert rules are defined in `.agent/alert_rules.json`. You can modify this file or use the `alert_on_threshold` tool.

Example `alert_rules.json`:
```json
[
  {
    "metric": "llm_error",
    "threshold": 0,
    "operator": ">",
    "contact": "slack_webhook_url"
  },
  {
    "metric": "llm_latency",
    "threshold": 5000,
    "operator": ">"
  }
]
```

### Metrics Storage
Metrics are stored in `.agent/metrics/YYYY-MM-DD.ndjson`.
Format:
```json
{"timestamp":"2023-10-27T10:00:00.000Z","agent":"llm","metric":"llm_latency","value":1234,"tags":{"model":"gpt-4"}}
```
