# Agency Dashboard Architecture

## Overview
The Agency Dashboard is the unified operational interface for the Digital Agency (Phase 23). It aggregates data from various MCP servers to provide a holistic view of the agency's performance, swarm activities, and system health.

## Architecture

### Server
- **Location**: `src/mcp_servers/agency_dashboard/`
- **Type**: MCP Server + Express HTTP Server
- **Port**: 3002 (HTTP)
- **Role**:
  - Connects to other MCP servers (`business_ops`, `health_monitor`) as a client.
  - Aggregates data via `data_aggregator.ts`.
  - Serves the React-based UI static files.
  - Exposes API endpoints for the UI (`/api/agency/*`).

### UI
- **Location**: `scripts/dashboard/ui/` (Source), `scripts/dashboard/dist_agency/` (Build)
- **Tech Stack**: React, Vite
- **Entry Point**: `scripts/dashboard/agency_main.tsx`
- **Config**: `scripts/dashboard/agency_vite.config.ts`

### Components
1.  **Swarm Fleet Panel**: Displays status of active swarms in a table format (`get_fleet_status`).
2.  **Financial KPI Panel**: Visualizes Revenue and Expenses cards (simulated data until full Xero integration).
3.  **Client Health Panel**: Lists clients with risk scores and status (simulated data).
4.  **System Health Panel**: Shows uptime, status, and detailed metrics (`get_health_report`).

## Usage

To launch the dashboard:

```bash
simple dashboard --agency
```

This will:
1.  Start the `agency_dashboard` server on port 3002.
2.  Open the dashboard in your default browser.

## Development

### Building the UI
```bash
cd scripts/dashboard
npm install
npm run build:agency
```

### Running the Server
```bash
# Via CLI
simple dashboard --agency

# Or manually
PORT=3002 npx tsx src/mcp_servers/agency_dashboard/index.ts
```
