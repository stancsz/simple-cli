# Ecosystem Auditor MCP Server

The Ecosystem Auditor is an essential MCP server responsible for monitoring, auditing, and explaining the behavior of the multi-agent digital biosphere. It acts as the central logging and reporting hub for Phase 37 (Production Ecosystem Observability & Governance).

## Architecture & Responsibilities

The Ecosystem Auditor provides tools to securely log critical events across the entire agency ecosystem, ensuring compliance, transparency, and operational debuggability.

### Key Tools

1. **`log_ecosystem_event`**:
   Accepts structured event logs regarding actions taken by child agencies or the central orchestrator. Events are strictly typed and stored sequentially in a reliable `.jsonl` format.
2. **`generate_ecosystem_audit_report`**:
   Reads the recent `.jsonl` logs from the file system and employs an LLM synthesis process to output human-readable Markdown reports categorized by "Key Events", "Policy Changes", "Morphology Adjustments", and "Anomalies". It also integrates with the Brain MCP's EpisodicMemory to store historical reports for trend analysis.

   **Parameters**:
   - `timeframe` (String): The timeframe to audit, e.g., 'last_24_hours', 'last_7_days', or 'last_30_days'.
   - `focus_area` (Optional String): The specific area to focus the audit on (`communications`, `policy_changes`, `morphology_adjustments`, or `all`). Defaults to `all`.

   **Example JSON Output**:
   ```json
   {
     "report_id": "audit-1715694300000",
     "timeframe": "last_24_hours",
     "focus_area": "all",
     "summary": "## Executive Summary\nEcosystem health is nominal...\n\n## Key Events\n- Agency A communicated with Agency B...",
     "events": [
       {
         "timestamp": "2024-05-14T12:00:00.000Z",
         "event_type": "communication",
         "source_agency": "agency_A",
         "description": "Task delegated",
         "metadata": {}
       }
     ]
   }
   ```

### Logging Schema

The `log_ecosystem_event` input strictly conforms to the following schema:
- `event_type` (Enum): Type of event (`communication`, `policy_change`, `morphology_adjustment`).
- `source_agency` (String): The UUID or string ID of the originating agency (e.g., `root`, `agency_123`).
- `target_agency` (Optional String): The ID of the target agency, if the event involves cross-agency interaction.
- `description` (String): A textual, human-readable description of the event.
- `metadata` (JSON Object): A dynamic record containing specifics about the event (e.g., resources transferred during a merge, parameters changed in a policy update).
- `timestamp` (Optional String): ISO 8601 string. Automatically populates if omitted.

Logs are written asynchronously to:
`.agent/ecosystem_logs/ecosystem_logs_<YYYY-MM-DD>.jsonl`

## Integration Points

The Ecosystem Auditor acts as an active sink for multiple core operations:

- **Agency Orchestrator (`src/mcp_servers/agency_orchestrator/`)**:
  - Emits `morphology_adjustment` events when child agencies are spawned, merged, or retired.
  - Emits `communication` events when tasks are delegated between agencies, or status updates flow upwards.
- **Brain MCP (`src/mcp_servers/brain/`)**:
  - Emits `policy_change` events whenever an ecosystem-wide strategic pivot is proposed or adopted.
- **Business Ops (`src/mcp_servers/business_ops/`)**:
  - Emits `policy_change` events during `update_operating_policy` invocations by C-Suite personas.

## Phase 37 Progress
- ✅ Implemented `EcosystemAuditor` MCP server.
- ✅ Added `log_ecosystem_event` tool with `.jsonl` logging capabilities.
- ✅ Added `generate_ecosystem_audit_report` tool with log parsing, LLM synthesis, and Brain MCP trend storage integration.
- ⬜ Integrate with Health Monitor for ecosystem visualization (coming next).

## Usage Guidelines

- **Always include metadata**: The `metadata` field should contain actionable data (e.g. `action: "spawn"`, `role: "developer"`).
- **Direct import bypass**: When logging from internal servers (like `agency_orchestrator`), you may import `auditLogger` directly from `src/mcp_servers/ecosystem_auditor/logger.js` to avoid the overhead of full MCP tool RPC roundtrips for high-frequency logs.
