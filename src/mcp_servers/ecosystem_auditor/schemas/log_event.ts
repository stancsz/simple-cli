import { z } from "zod";

/**
 * Zod schema for the log_ecosystem_event tool input.
 * This aligns with the EcosystemAuditLogEntry interface.
 */
export const logEcosystemEventSchema = z.object({
  event_type: z.string().describe("The type of event (e.g., 'communication', 'policy_change', 'spawn', 'merge', 'retire')."),
  source_agency: z.string().describe("The ID of the agency originating the event."),
  target_agency: z.string().optional().describe("The ID of the target agency (if applicable)."),
  payload: z.union([z.string(), z.record(z.any())]).describe("A JSON string or object containing the event details."),
  timestamp: z.string().optional().describe("ISO 8601 timestamp. Will default to current time if omitted.")
});

export type LogEcosystemEventInput = z.infer<typeof logEcosystemEventSchema>;
