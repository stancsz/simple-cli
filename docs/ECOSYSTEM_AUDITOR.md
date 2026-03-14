# Ecosystem Auditor (Phase 37)

The Ecosystem Auditor is an MCP server responsible for monitoring, logging, and reporting on all cross-agency communications, policy changes, and morphology adjustments across the Jules multi-agent ecosystem. It acts as the immutable, centralized source of truth for ecosystem-level governance and observability.

## Architecture

The server runs on Stdio transport and provides three core tools. It stores logs as JSON Lines (`.jsonl`) files in the `.agent/audit_logs/` directory.

### Log Rotation

To prevent unbounded storage growth, the server automatically rotates logs when the active `audit_trail.jsonl` file exceeds 5MB. Older logs are archived with a timestamp suffix (e.g., `audit_trail_1678888888888.jsonl`) and are automatically included in query and export operations.

## Event Schema

All events are logged with the following structure:

```json
{
  "timestamp": 1678888888888,
  "event_type": "agency_spawn",
  "source_agency": "agency_orchestrator",
  "target_agency": "agency_1234-5678",
  "data": { ... },
  "metadata": { ... }
}
```

### Event Types

*   `agency_spawn`: Recorded when the orchestrator spawns a new child agency.
*   `agency_merge`: Recorded when two agencies merge contexts.
*   `agency_retire`: Recorded when an agency is archived.
*   `inter_agency_call`: Recorded for cross-agency RPC/Delegation calls.
*   `policy_change`: Recorded when the Brain MCP updates the global ecosystem operating policy.
*   `morphology_adjustment`: Recorded when the Brain MCP evaluates metric thresholds and requests structural changes.

## Available Tools

### `log_audit_event`

Appends a new event to the active log file.

**Parameters:**
*   `event_type` (required): Must be one of the enum event types listed above.
*   `source_agency` (optional): The ID of the agency triggering the event.
*   `target_agency` (optional): The ID of the affected agency.
*   `data` (required): Serialized payload containing event details.
*   `metadata` (optional): Key-value pairs for additional context.

### `query_audit_logs`

Reads all log files (active and archived) and returns a filtered array of events, sorted by timestamp descending.

**Parameters:**
*   `time_range` (optional): `{ start?: number, end?: number }` Filter by epoch milliseconds.
*   `event_type` (optional): Filter by a specific event type.
*   `agency_id` (optional): Filter events where `source_agency` or `target_agency` matches this ID.

### `export_audit_trail`

Reads all log files and exports the complete trail. Sorts by timestamp ascending for chronological readability.

**Parameters:**
*   `format` (required): `"json"` or `"csv"`.

## Integration Hooks

The Ecosystem Auditor is designed to be called asynchronously by other MCP servers using the `@modelcontextprotocol/sdk/client` package via `StdioClientTransport`.

*   **Agency Orchestrator (`src/mcp_servers/agency_orchestrator/`)**: Logs `agency_spawn`, `agency_merge`, and `agency_retire` events.
*   **Brain MCP (`src/mcp_servers/brain/`)**: Logs `policy_change` (`propose_ecosystem_policy_update`) and `morphology_adjustment` (`adjust_ecosystem_morphology`) events.
