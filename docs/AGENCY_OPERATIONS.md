# Autonomous Agency Operations (Phase 21)

This document outlines the architecture and operational procedures for running Simple Biosphere as a production-grade autonomous agency.

## Architecture

The system transitions from a scheduled showcase runner to a continuous, multi-tenant operation powered by the `AgencyOperations` MCP server and an enhanced Scheduler.

### Components

1.  **Agency Operations MCP (`src/mcp_servers/agency_operations/`)**
    *   **Workflow Registry**: Stores active workflows, their schedules, and current state per client.
    *   **Reporting Engine**: Generates weekly/monthly PDF/Markdown reports for clients.
    *   **Escalation Protocol**: Monitors workflow health and triggers alerts (Slack/Email) if manual intervention is needed.

2.  **Multi-Tenant Scheduler (`src/daemon.ts` + `src/scheduler/executor.ts`)**
    *   **Production Mode**: Runs continuously with `PRODUCTION_MODE=true`.
    *   **Context Injection**: Injects specific `CompanyContext` (Profile + RAG) into every task execution.
    *   **Isolation**: Ensures strict data boundaries between clients.
    *   **Resilience**: Implements exponential backoff for transient failures.

3.  **Business Health Monitor (`src/mcp_servers/health_monitor/`)**
    *   Tracks high-level business KPIs:
        *   Workflows Completed vs. Scheduled
        *   SLA Compliance
        *   Estimated Revenue/Cost per Client

## Usage

### Starting Production Mode

To start the agency in production mode:

```bash
export PRODUCTION_MODE=true
export JULES_COMPANY="" # Clear any default company
npm run daemon
```

### Managing Workflows

Workflows are defined in `.agent/agency_workflows.json` (managed via MCP tools).

Example Workflow Definition:
```json
{
  "id": "onboarding-client-a",
  "client": "client-a",
  "type": "client_onboarding",
  "status": "active",
  "schedule": "0 9 * * 1", // Weekly on Monday
  "next_run": "2023-10-27T09:00:00Z"
}
```

### Escalation

If a workflow fails 3 times consecutively, it enters `escalated` state. The `escalation_manager` will trigger a notification.

## Security & Isolation

*   **Process Isolation**: Each task runs in a separate child process.
*   **Context Isolation**: The `CompanyContext` server enforces strict boundaries based on the injected `company_id`.
*   **Memory Separation**: Episodic memory is tagged with `company_id` and filtered during retrieval.
