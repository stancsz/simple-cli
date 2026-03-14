# Ecosystem Auditor

The **Ecosystem Auditor** is an MCP server designed to provide production observability and governance across the Simple Biosphere multi-agency ecosystem (Phase 37). It intercepts, logs, and analyzes cross-agency decisions, ensuring compliance, debuggability, and transparency.

## Capabilities

The server exposes two main tools:
1. `log_audit_event`: Used internally by root and child agencies to record significant actions.
2. `generate_ecosystem_audit_report`: Synthesizes logs into actionable insights using LLM meta-analysis.

## Logging Schema

Events are appended asynchronously to `.agent/ecosystem_audit/logs/audit.jsonl` to ensure high throughput and non-blocking I/O.

**AuditEvent Interface:**
```typescript
{
  "event_id": "aud-1a2b3c4d",
  "timestamp": "2026-03-14T12:00:00Z", // ISO 8601 string
  "event_type": "cross_agency_communication" | "policy_change" | "morphology_adjustment",
  "source_agency": "root", // Optional
  "target_agency": "agency_A", // Optional
  "agencies_involved": ["root", "agency_A"],
  "payload": {
     // Flexible JSON payload specific to the event_type
     "action": "spawn",
     "role": "data_analyst"
  }
}
```

## Report Generation

The `generate_ecosystem_audit_report` tool queries the local `audit.jsonl` store and passes a truncated window (to prevent context overflow) of logs to the standard Brain LLM for analysis.

Reports are automatically stored as `.json` files in `.agent/ecosystem_audit/reports/`.

**Output Schema:**
```json
{
  "report_id": "report-9f8e7d6c",
  "timestamp": "2026-03-14T12:05:00Z",
  "timeframe": "last_24_hours",
  "focus_area": "all",
  "executive_summary": "...",
  "key_findings": ["...", "..."],
  "compliance_status": "compliant", // or warning, non_compliant
  "recommendations": ["...", "..."],
  "events_analyzed": 45
}
```

## Integrations
- **Agency Orchestrator:** Automatically logs morphology adjustments (`spawn`, `merge`, `retire`).
- **Brain MCP:** Automatically logs strategic and ecosystem policy updates.
