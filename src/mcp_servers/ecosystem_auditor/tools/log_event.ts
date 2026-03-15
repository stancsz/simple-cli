import { auditLogger } from "../logger.js";
import { LogEcosystemEventInput } from "../schemas/log_event.js";
import { EcosystemAuditLogEntry } from "../types.js";

/**
 * Executes the log_ecosystem_event tool logic.
 * Parses the payload (if it's a string) and logs the event asynchronously via the AuditLogger.
 *
 * @param input The validated schema input.
 * @returns An object indicating success or failure.
 */
export async function executeLogEcosystemEvent(input: LogEcosystemEventInput): Promise<{ success: boolean; message: string }> {
  try {
    const eventToLog: EcosystemAuditLogEntry = {
      timestamp: input.timestamp || new Date().toISOString(),
      event_type: input.event_type,
      source_agency: input.source_agency,
      target_agency: input.target_agency,
      description: input.description,
      metadata: input.metadata,
    };

    // Non-blocking log operation
    await auditLogger.logEvent(eventToLog);

    return {
      success: true,
      message: `Successfully logged ecosystem event: ${input.event_type}`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to log ecosystem event: ${error.message}`,
    };
  }
}
