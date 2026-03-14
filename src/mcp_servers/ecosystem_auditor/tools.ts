import { z } from "zod";
import { generateAuditReport } from "./report_generator.js";

/**
 * Input schema for the generate_ecosystem_audit_report tool.
 */
export const generateEcosystemAuditReportSchema = z.object({
  timeframe: z.string().describe("The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'."),
  focus_area: z.enum(["communications", "policy_changes", "morphology_adjustments", "all"]).optional().default("all"),
  agency_id: z.string().optional().describe("Filter logs to a specific agency.")
});

/**
 * Type inferred from the generateEcosystemAuditReportSchema.
 */
export type GenerateEcosystemAuditReportInput = z.infer<typeof generateEcosystemAuditReportSchema>;

/**
 * Input schema for logging an audit event.
 */
export const logAuditEventSchema = z.object({
  event_type: z.enum(["cross_agency_communication", "policy_change", "morphology_adjustment", "resource_allocation", "anomaly_detected", "system_event"]),
  source_agency: z.string().optional(),
  target_agency: z.string().optional(),
  agencies_involved: z.array(z.string()).optional(),
  payload: z.any()
});

/**
 * Type inferred from the logAuditEventSchema.
 */
export type LogAuditEventInput = z.infer<typeof logAuditEventSchema>;

/**
 * Generates an ecosystem audit report based on cross-agency logs and metrics.
 *
 * @param {GenerateEcosystemAuditReportInput} input - The input parameters containing timeframe and focus area.
 * @returns {Promise<any>} A promise resolving to the generated audit report.
 */
export async function generateEcosystemAuditReport(input: GenerateEcosystemAuditReportInput): Promise<any> {
  return generateAuditReport(input);
}
