# Ecosystem Auditor MCP Server

## Overview
The Ecosystem Auditor MCP server implements foundational components of Phase 37: Production Ecosystem Observability & Governance. Its primary purpose is to enable the root agency to monitor, audit, and explain the behaviors and decisions across the entire multi-agency ecosystem.

This ensures transparency, debuggability, and compliance as the ecosystem autonomously scales, spawns, merges, and retires child agencies.

## Architecture

The server provides a non-blocking logger (`AuditLogger`) that persists ecosystem events directly to daily rotated JSONL files.

For performance reasons, the underlying `AuditLogger` singleton can be directly imported into local processes (like the `agency_orchestrator` and `brain` MCP servers) to log events synchronously without the overhead of spawning child transport processes for every single event.

Alternatively, external systems can call the `log_ecosystem_event` tool via the standard MCP interface.

Logs are stored by default in `.agent/ecosystem_audit/logs/ecosystem_logs_YYYY-MM-DD.jsonl`.

## Event Schema

Events conform to the `EcosystemAuditLogEntry` interface:

```typescript
export interface EcosystemAuditLogEntry {
    timestamp: string; // ISO 8601 string
    event_type: 'communication' | 'policy_change' | 'morphology_adjustment' | 'anomaly' | 'spawn' | 'merge' | 'retire' | string;
    source_agency: string;
    target_agency?: string;
    payload: any; // Context-specific details
}
```

## Available Tools

### `log_ecosystem_event`
Logs an ecosystem event.

**Inputs:**
- `event_type` (string, required): The type of event.
- `source_agency` (string, required): The ID of the originating agency.
- `target_agency` (string, optional): The ID of the targeted agency.
- `payload` (string or object, required): JSON detailing the event context.
- `timestamp` (string, optional): Defaults to the current ISO string.

### `generate_ecosystem_audit_report`
Synthesizes the raw JSONL logs into actionable, human-readable insights using the LLM.

**Inputs:**
- `timeframe` (string, required): The timeframe to audit (e.g., "last_24_hours").
- `focus_area` (string, optional): The focus of the report (e.g., "morphology_adjustments").

## Integrations

- **Agency Orchestrator**: Direct injection of `AuditLogger` to log `spawn`, `merge`, and `retire` morphology actions.
- **Brain MCP**: Direct injection of `AuditLogger` to record `policy_change` deployments and structural `morphology_adjustment` proposals.
