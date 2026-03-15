/**
 * Interface representing a single ecosystem audit log entry.
 */
export interface EcosystemAuditLogEntry {
    timestamp: string; // ISO 8601 string
    event_type: 'communication' | 'policy_change' | 'morphology_adjustment';
    source_agency: string;
    target_agency?: string;
    description: string;
    metadata: Record<string, any>;
}

/**
 * Interface representing an ecosystem audit report.
 */
export interface EcosystemAuditReport {
    report_id: string;
    timeframe: string;
    focus_area: string;
    summary: string;
    events: EcosystemAuditLogEntry[];
}
