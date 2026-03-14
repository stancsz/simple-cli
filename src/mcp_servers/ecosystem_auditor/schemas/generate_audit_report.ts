import { z } from "zod";

/**
 * Input schema for the generate_ecosystem_audit_report tool.
 */
export const generateEcosystemAuditReportSchema = z.object({
  timeframe: z.string().describe("The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'."),
  focus_area: z.enum(["communications", "policy_changes", "morphology_adjustments", "all"]).optional().default("all")
});

/**
 * Type inferred from the generateEcosystemAuditReportSchema.
 */
export type GenerateEcosystemAuditReportInput = z.infer<typeof generateEcosystemAuditReportSchema>;
