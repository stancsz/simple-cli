# Jules Agency Dashboard

The Agency Dashboard provides a unified operational view of the entire agency ecosystem, aggregating data from multiple swarms, financial systems, and system health monitors.

## Features

### 1. Swarm Fleet Status
Displays real-time status of all client swarms managed by the agency.
- **Data Source:** Linear Projects & Issues (via `business_ops` MCP).
- **Metrics:**
  - **Active Agents:** Number of agents currently assigned to the project.
  - **Pending Issues:** Count of open tasks/issues.
  - **Health:** Calculated based on issue volume and velocity (Healthy vs. Strained).

### 2. Financial KPIs
Provides high-level financial health indicators.
- **Data Source:** Xero (via `business_ops` MCP).
- **Metrics:**
  - **Revenue (Last 30d):** Sum of payments received in the last 30 days (proxy for MRR).
  - **Outstanding Invoices:** Total amount due on authorized invoices.
  - **Overdue Invoices:** Total amount due on invoices past their due date.
  - **Active Clients:** Count of unique clients with recent billing activity.

### 3. System Health
Monitors the technical health of the Jules framework.
- **Data Source:** Health Monitor MCP (internal metrics).
- **Metrics:**
  - **Uptime:** Duration the Health Monitor has been running.
  - **Active Alerts:** Current system alerts (e.g., high error rates, latency spikes).
  - **Showcase Status:** Result of the most recent automated capability test.

## Architecture

The dashboard is a Vue.js Single Page Application (SPA) served by the Health Monitor MCP.

- **Frontend:** Vue 3 + Vite. Located in `scripts/dashboard/`.
- **Backend:** Health Monitor MCP (`src/mcp_servers/health_monitor/`).
  - **API Endpoint:** `/api/dashboard/data`.
  - **Integration:** Connects to `business_ops` MCP via Stdio to fetch fleet and financial data.

## Usage

To launch the dashboard:

```bash
simple dashboard
```

This command will:
1. Start the Health Monitor server (if not running).
2. Open the dashboard in your default browser (usually `http://localhost:3004`).

## Development

- **Frontend:** Run `npm run dev` in `scripts/dashboard/` for hot-reload.
- **Backend:** Run `npx tsx src/mcp_servers/health_monitor/index.ts` to start the API server.
- **Mock Data:** Set `MOCK_DATA=true` environment variable to serve sample data without connecting to external services.
