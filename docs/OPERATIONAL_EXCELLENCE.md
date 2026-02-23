# Operational Excellence: Monitoring & Dashboard

This document details the monitoring, alerting, and dashboard capabilities of the Simple CLI platform.

## Overview

The Operational Excellence suite provides:
1.  **Real-time Metrics**: Token usage, latency, and task outcomes.
2.  **Multi-Tenant Dashboard**: View metrics per company/client.
3.  **Cost Analytics**: Estimated costs based on token usage.
4.  **4-Pillar Health**: Specific metrics for SOP Engine, Ghost Mode, HR Loop, and Company Context.
5.  **Alerting**: Automated alerts for errors or thresholds.
6.  **Operational Persona**: Natural language daily standups via "Sarah_DevOps".

## Components

### 1. Health Monitor MCP
Located in `src/mcp_servers/health_monitor/`.
- **Role**: Aggregates metrics from the Brain (LanceDB) and flat files.
- **Tools**: `track_metric`, `track_pillar_metric`, `get_health_report`, `check_alerts`, `get_company_metrics`, `get_pillar_metrics`.
- **API**: Exposes `GET /api/dashboard/metrics` for the dashboard.

### 2. Dashboard UI
Located in `scripts/dashboard/`.
- **Tech Stack**: Vue.js 3 + Vite + Chart.js.
- **Features**:
    - **Token Usage**: Bar chart per company.
    - **Success Rates**: Percentage of successful tasks.
    - **Cost Estimation**: Projected costs.
    - **Pillar Metrics**: Detailed health scores for SOP, Ghost, HR, and Context pillars.
    - **Company Detail View**: Drill down into specific company metrics.
    - **System Status**: Real-time health check.

### 3. Brain Integration
Metrics are stored in `EpisodicMemory` (LanceDB) alongside task logs.
- **Fields**: `tokens`, `duration`, `outcome`.
- **Sources**: SOP Engine, Job Delegator.

## 4-Pillar Metrics

The dashboard now tracks specific metrics for the 4 pillars of the operational model:

### SOP Engine
- `sop_execution_success_rate`: Percentage of SOPs completed successfully.
- `sop_execution_time`: Average time to execute an SOP.
- `sop_retry_count`: Number of retries required.

### Ghost Mode
- `ghost_task_completion_rate`: Rate of autonomous task completion.
- `scheduled_task_count`: Number of tasks scheduled via Ghost Mode.
- `autonomous_hours`: Total hours of autonomous operation.

### HR Loop
- `hr_proposals_generated`: Number of HR proposals created.
- `core_updates_applied`: Number of core updates applied to memory.
- `dreaming_resolutions`: Conflicts resolved during dreaming phase.

### Company Context
- `context_queries`: Number of context retrievals.
- `brain_memory_usage`: Size of episodic memory.
- `company_switch_count`: Frequency of context switching.

## Usage

### Running Locally
To start the dashboard locally, run the Health Monitor MCP. It serves the dashboard on port `3004` (default).

```bash
# Ensure dependencies are installed and built
cd scripts/dashboard
npm install
npm run build

# Start the Health Monitor (part of the MCP server suite)
# usually managed via `mcp-server` or `docker-compose`
```
Access at `http://localhost:3004`.

### Kubernetes Deployment
The dashboard is included in the Helm chart.
Enable it in `values.yaml`:
```yaml
dashboard:
  enabled: true
  port: 3004
```
It will be deployed as a separate pod and service.

### Alerting
Configure alerts in `scripts/dashboard/alert_rules.json`.
Example:
```json
[
  {
    "metric": "sop_execution_success_rate",
    "threshold": 90,
    "operator": "<",
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
