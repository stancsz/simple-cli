# Health Monitor Dashboard

The Health Monitor MCP provides an overarching operational dashboard for the entire agency ecosystem. It collects and visualizes system health, financial KPIs, swarm fleet status, and architectural metrics.

## Ecosystem Auditor Integration

As part of Phase 37, the Health Monitor dashboard integrates directly with the **Ecosystem Auditor MCP** to visualize the ecosystem topology and tracking decision trails.

### EcosystemAuditPanel

A new dashboard panel, `EcosystemAuditPanel`, connects to the `/api/dashboard/ecosystem-audit` endpoint, which proxies calls to the `generate_ecosystem_audit_report` tool in the Ecosystem Auditor.

**Features:**
- **Filtering by Timeframe & Focus Area:** Users can filter audit logs for the last 24 hours or 7 days, and focus on specific areas like `communications`, `policy_changes`, or `morphology_adjustments`.
- **Ecosystem Topology:** Displays a static network graph showing the root agency and its spawned child agencies, representing their organizational topology.
- **Decision Trails:** Renders a timeline/table of strategic, structural, and collaborative events taken across the ecosystem.

### Endpoints
- `GET /api/dashboard/ecosystem-audit`: Fetches the audit report. Requires `timeframe` and `focus_area` query parameters.

### Tools
- `get_ecosystem_audit_logs`: A Health Monitor tool that wraps the Ecosystem Auditor call, allowing LLMs to programmatically request and interpret the ecosystem audit trails.
