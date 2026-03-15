# Ecosystem Observability Dashboard

The Ecosystem Observability Dashboard provides a centralized, visual interface for monitoring the dynamic structure and decision-making trails of the multi-agency Simple-CLI ecosystem.

## Core Features

1.  **Dynamic Topology Visualization**
    *   Leverages `Mermaid.js` to render the live hierarchical structure of the agency ecosystem.
    *   Nodes represent individual agencies (e.g., `root`, `agency-alpha`), dynamically styled by their current operational status (`active`, `archived`, `failed`).
    *   Edges visualize the parent-child spawning relationships.

2.  **Filterable Decision Trails**
    *   Provides a chronological ledger of all critical ecosystem events logged by the `EcosystemAuditor` MCP server.
    *   Events are categorized into:
        *   `morphology_adjustments`: Spawning, merging, or retiring of child agencies.
        *   `policy_changes`: Updates to swarm configurations or corporate strategy.
        *   `communications`: Cross-agency task delegations and messages.
    *   Users can filter logs by timeframe (e.g., "Last 24 Hours", "Last 7 Days"), focus area, and specific agency IDs.

## Architecture & Integration

The dashboard is served by the Health Monitor Express application on the `/ecosystem` route. It interacts with the `Health Monitor MCP Server`, which acts as an aggregator proxy:

1.  **Ecosystem Auditor MCP:** The core source of truth, reading `.jsonl` files from `.agent/ecosystem_logs/`.
2.  **Health Monitor MCP:** Exposes `get_ecosystem_topology` and `get_ecosystem_decision_logs` tools. It internally connects to the Ecosystem Auditor via Stdio transport.
3.  **Frontend Web Client:** Fetches structured JSON data from the Health Monitor API endpoints (`/api/dashboard/ecosystem-topology`, `/api/dashboard/ecosystem-decision-logs`) and renders the UI using Vanilla JS and Mermaid.js.

## Security Considerations

*   **XSS Protection:** All dynamic log content (agency IDs, descriptions) is injected into the DOM using safe `textContent` and `createElement` methods to prevent Cross-Site Scripting (XSS) vulnerabilities.
*   **Graceful Degradation:** If the backend Ecosystem Auditor service is unavailable or disconnected, the dashboard gracefully displays an error state without crashing the primary Node server.