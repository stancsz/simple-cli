# Scheduled Automated Showcase Validation

The **Simple Biosphere** 4-pillar system is validated continuously via an automated scheduled workflow. This ensures that the core pillars—Company Context, SOP-as-Code, Ghost Mode, and HR Loop—remain operational and integrated as the system evolves.

## Architecture

The validation pipeline consists of three components:
1.  **Showcase Runner**: A script (`scripts/showcase-runner.ts`) that orchestrates the execution of the `run_demo.ts` simulation within a Docker container.
2.  **Health Monitor Extension**: A module within the Health Monitor MCP (`src/mcp_servers/health_monitor/showcase_reporter.ts`) that records structured results of each run.
3.  **GitHub Actions Workflow**: A scheduled job (`.github/workflows/daily-showcase.yml`) that triggers the runner daily and on push.

## Workflow Logic

1.  **Trigger**:
    - Daily at 2:00 AM UTC.
    - On every push to `main`.

2.  **Execution**:
    - The runner launches the `agent` service using `docker compose` (reusing `demos/simple-cli-showcase/docker-compose.yml`).
    - It executes `npx tsx /app/showcase/run_demo.ts` inside the container.
    - The runner captures `stdout` and `stderr` to track progress through the 5 pillars.

3.  **Metrics Collection**:
    - **Step Status**: Tracks success/failure of each pillar (Context, SOP, Ghost Mode, HR Loop, Framework).
    - **Duration**: Measures end-to-end execution time.
    - **Artifacts**: Counts generated logs and proposals in `.agent/`.

4.  **Reporting**:
    - Results are stored in `.agent/health_monitor/showcase_runs.json`.
    - The Health Monitor MCP exposes these results via the `/api/dashboard/showcase-runs` endpoint.
    - The Dashboard UI displays a history of recent runs with pass/fail status.

## Manual Execution

To run the validation manually:

```bash
# Ensure Docker is running
npx tsx scripts/showcase-runner.ts
```

## Dashboard Integration

The Operational Dashboard includes a **Showcase Validation** panel that displays:
- Status (PASS/FAIL)
- Timestamp
- Duration
- Breakdown of steps executed

This provides immediate visibility into the health of the autonomous agency simulation.
