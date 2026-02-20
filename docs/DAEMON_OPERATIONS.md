# Daemon Operations Guide

## Overview
The "Ghost Mode" Daemon (`src/daemon.ts`) is the persistent heartbeat of the Digital Co-worker. It operates as a robust **Supervisor**, managing the lifecycle of the **Scheduler** and ensuring 24/7 availability.

## Architecture

### 1. Supervisor (Daemon)
- **Role**: Process manager.
- **Responsibility**:
  - Spawns the Scheduler process.
  - Monitors for crashes (unexpected exits).
  - Automatically restarts the Scheduler with backoff.
  - Maintains the global `.agent/daemon_state.json`.
  - Handles system signals (`SIGTERM`, `SIGINT`) for graceful shutdown.
- **Entry Point**: `src/daemon.ts` (via `npm run daemon`).

### 2. Worker (Scheduler)
- **Role**: Task orchestrator.
- **Responsibility**:
  - Loads task definitions from `scheduler.json`.
  - Schedules tasks using `node-cron`.
  - Spawns isolated task execution processes (via `JobDelegator`).
  - Reports state changes (Task Start/End) to the Daemon via IPC (stdout).
- **Entry Point**: `src/scheduler/service.ts`.

### 3. State Manager
- **File**: `.agent/daemon_state.json`.
- **Content**:
  - `uptime`: When the daemon started.
  - `schedulerPid`: Current PID of the worker.
  - `restarts`: Count of crash recoveries.
  - `activeTasks`: List of currently executing tasks (persisted across restarts).

## Health Monitoring

A dedicated **Daemon Health MCP Server** (`src/mcp_servers/daemon_health.ts`) exposes tools for agents and admins to monitor the system.

### Available Tools:
1.  **`get_daemon_status`**: Returns the JSON content of the state file, including uptime and restart counts.
2.  **`view_daemon_logs`**: Retrieves the last N lines of `.agent/logs/daemon.log`.
3.  **`restart_scheduler`**: Forces a restart of the Scheduler component (useful if stuck).

## Recovery Procedures

### Automatic Recovery
If the Scheduler crashes:
1.  Daemon logs the exit code.
2.  Daemon increments the `restarts` counter in state.
3.  Daemon waits 5 seconds.
4.  Daemon spawns a new Scheduler process.
5.  New Scheduler reads `daemon_state.json` on startup.
6.  Any tasks marked as `active` are automatically re-queued/resumed.

### Manual Intervention
If the Daemon itself is stuck or unresponsive:
1.  **Check Logs**: `tail -f .agent/logs/daemon.log`
2.  **Restart Container**: `docker restart <container_id>`
    - The Daemon will initialize fresh but attempt to load previous state.

## Development
- **Run locally**: `npm run daemon`
- **Run tests**: `npm test tests/integration/daemon_resilience.test.ts`
