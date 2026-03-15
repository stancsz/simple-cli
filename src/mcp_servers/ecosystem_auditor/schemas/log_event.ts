import { z } from "zod";

/**
 * Zod schema for the log_ecosystem_event tool input.
 * This aligns with the EcosystemAuditLogEntry interface.
 */
export const logEcosystemEventSchema = z.object({
  event_type: z.enum(['communication', 'policy_change', 'morphology_adjustment']).describe("The type of event."),
  source_agency: z.string().describe("The ID of the agency originating the event."),
  target_agency: z.string().optional().describe("The ID of the target agency (if applicable)."),
  description: z.string().describe("A textual description of the event."),
  metadata: z.record(z.any()).describe("A JSON object containing the event details."),
  timestamp: z.string().optional().describe("ISO 8601 timestamp. Will default to current time if omitted.")
});

export type LogEcosystemEventInput = z.infer<typeof logEcosystemEventSchema>;
