export type AuditEventType =
  | "cross_agency_communication"
  | "policy_change"
  | "morphology_adjustment"
  | "resource_allocation"
  | "anomaly_detected"
  | "system_event";

export interface AuditEvent {
  event_id: string;
  timestamp: string; // ISO 8601 string
  event_type: AuditEventType;
  source_agency?: string;
  target_agency?: string;
  agencies_involved: string[];
  payload: any;
}

export interface EcosystemAuditReport {
  report_id: string;
  timestamp: string; // ISO 8601 string
  timeframe: string;
  focus_area: string;
  executive_summary: string;
  key_findings: string[];
  compliance_status: "compliant" | "warning" | "non_compliant";
  recommendations: string[];
  events_analyzed: number;
}
