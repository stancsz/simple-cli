import { appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { EcosystemAuditLogEntry } from "./types.js";

/**
 * Singleton logger class for the Ecosystem Auditor.
 * Responsible for non-blocking asynchronous writes to a dated JSONL file.
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private logDirectory: string;

  // Make constructor public for testing overrides
  public constructor() {
    // Determine the base agent directory, defaulting to process.cwd()/.agent if not set
    const baseDir = process.env.JULES_AGENT_DIR
      ? process.env.JULES_AGENT_DIR
      : join(process.cwd(), ".agent");

    this.logDirectory = join(baseDir, "ecosystem_logs");

    // Ensure directory exists synchronously during initialization (or we can do it lazily)
    if (!existsSync(this.logDirectory)) {
      // Create synchronously so we don't need async init just for directory
      import("fs").then(fs => {
        if (!fs.existsSync(this.logDirectory)) {
          fs.mkdirSync(this.logDirectory, { recursive: true });
        }
      });
    }
  }

  /**
   * Retrieves the singleton instance of the AuditLogger.
   */
  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Generates the filename for the current day.
   */
  private getDailyLogFilename(): string {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return join(this.logDirectory, `ecosystem_logs_${today}.jsonl`);
  }

  /**
   * Helper function to ensure the directory exists asynchronously before writing.
   */
  private async ensureDirectoryExists(): Promise<void> {
    if (!existsSync(this.logDirectory)) {
      await mkdir(this.logDirectory, { recursive: true });
    }
  }

  /**
   * Logs an ecosystem event to the daily log file.
   * This operation is non-blocking.
   *
   * @param event The ecosystem event to log.
   */
  public async logEvent(event: EcosystemAuditLogEntry): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      const filename = this.getDailyLogFilename();

      // Ensure the timestamp is set if missing
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }

      const logLine = JSON.stringify(event) + "\n";

      // Non-blocking write
      await appendFile(filename, logLine, "utf-8");
    } catch (error) {
      console.error("Failed to write to ecosystem audit log:", error);
    }
  }

  /**
   * Flushes any pending logs (if we implement a buffer in the future).
   * For now, appendFile is used directly so this is a no-op, but provided for interface completeness.
   */
  public async flush(): Promise<void> {
    // Currently a no-op as writes are direct
  }
}

// Export a default instance for convenience
export const auditLogger = AuditLogger.getInstance();
