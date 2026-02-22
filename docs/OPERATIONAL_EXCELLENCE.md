# Operational Excellence: Monitoring & Dashboard

This document details the monitoring, alerting, and dashboard capabilities of the Simple CLI platform.

## Overview

The Operational Excellence suite provides:
1.  **Real-time Metrics**: Token usage, latency, and task outcomes.
2.  **Multi-Tenant Dashboard**: View metrics per company/client.
3.  **Cost Analytics**: Estimated costs based on token usage.
4.  **Alerting**: Automated alerts for errors or thresholds.
5.  **Operational Persona**: Natural language daily standups via "Sarah_DevOps".

## Components

### 1. Health Monitor MCP
Located in `src/mcp_servers/health_monitor/`.
- **Role**: Aggregates metrics from the Brain (LanceDB) and flat files.
- **Tools**: `track_metric`, `get_health_report`, `check_alerts`, `get_company_metrics`.
- **API**: Exposes `GET /api/metrics` for the dashboard.

### 2. Dashboard UI
Located in `scripts/dashboard/`.
- **Tech Stack**: Node.js (Express) + Vanilla JS + Chart.js.
- **Features**:
    - **Token Usage**: Bar chart per company.
    - **Success Rates**: Percentage of successful tasks.
    - **Cost Estimation**: Projected costs.
    - **System Status**: Real-time health check.

### 3. Brain Integration
Metrics are stored in `EpisodicMemory` (LanceDB) alongside task logs.
- **Fields**: `tokens`, `duration`, `outcome`.
- **Sources**: SOP Engine, Job Delegator.

## Usage

### Running Locally
To start the dashboard locally:
```bash
node scripts/dashboard/server.js
```
Access at `http://localhost:3003`.

Ensure `HealthMonitor` is running (usually port 3004).

### Kubernetes Deployment
The dashboard is included in the Helm chart.
Enable it in `values.yaml`:
```yaml
dashboard:
  enabled: true
  port: 3003
```
It will be deployed as a separate pod and service.

### Alerting
Configure alerts in `scripts/dashboard/alert_rules.json`.
Example:
```json
[
  {
    "metric": "error_rate",
    "threshold": 5,
    "operator": ">",
    "contact": "https://hooks.slack.com/..."
  }
]
```

## Daily Standups
The **Operational Persona** generates daily reports.
Run manually:
```bash
simple run-task --task "generate_daily_standup"
```
Or schedule via `scheduler.json`.
