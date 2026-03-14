# Ecosystem Auditor

The **Ecosystem Auditor** is an MCP server responsible for monitoring, auditing, and explaining the behavior of the entire child agency ecosystem. It operates non-blockingly, listening for events such as spawning, cross-agency communications, policy updates, and anomalies, storing them persistently for review.

## Tools

### `generate_ecosystem_audit_report`

This tool parses the stored `.jsonl` audit logs within a specified timeframe and generates a synthesized, human-readable report.

It groups logs by event type and utilizes the LLM to write a comprehensive overview, making sense of vast amounts of ecosystem telemetry.

**Parameters**:
- `timeframe` (string, required): e.g., "last_24_hours", "last_7_days", "last_30_days".
- `focus_area` (string, optional): One of "communications", "policy_changes", "morphology_adjustments", or "all". Default is "all".

**Output**:
Returns a JSON object containing:
- `report_id`: Unique identifier for the audit report.
- `timeframe`: The evaluated time period.
- `focus_area`: The applied filter.
- `summary`: A detailed Markdown string synthesized by the LLM containing: Executive Summary, Key Events, Policy Changes, Morphology Adjustments, Anomalies & Risks, and Recommendations.
- `events`: The raw log entries used to generate the report (capped at 500 records).

## Log Structure

The logs are appended asynchronously to `.agent/ecosystem_audit/logs/audit.jsonl` with the following schema:
- `timestamp`: ISO 8601 string.
- `event_type`: Type of event (e.g., spawn, merge, communication, anomaly, policy_change).
- `source_agency`: Originating agency ID.
- `target_agency`: (Optional) Recipient agency ID.
- `payload`: The event-specific data payload.