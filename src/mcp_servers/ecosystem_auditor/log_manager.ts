import { appendFile, mkdir, readdir, stat, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { EcosystemAuditLogEntry } from "./types.js";

const MAX_LOG_FILES = 7; // Keep a week's worth of logs if daily, or roughly 7 files

/**
 * Singleton logger class for the Ecosystem Auditor.
 * Responsible for non-blocking asynchronous writes to a dated JSONL file.
 * Handles rotating log files to prevent unbounded growth.
 */
export class AuditLogManager {
  private static instance: AuditLogManager;
  private logDirectory: string;

  private constructor() {
    // Determine the base agent directory, defaulting to process.cwd()/.agent if not set
    const baseDir = process.env.JULES_AGENT_DIR
      ? process.env.JULES_AGENT_DIR
      : join(process.cwd(), ".agent");

    this.logDirectory = join(baseDir, "ecosystem_logs");

    // Ensure directory exists synchronously during initialization
    if (!existsSync(this.logDirectory)) {
      import("fs").then((fs) => {
        if (!fs.existsSync(this.logDirectory)) {
          fs.mkdirSync(this.logDirectory, { recursive: true });
        }
      });
    }
  }

  /**
   * Retrieves the singleton instance of the AuditLogManager.
   */
  public static getInstance(): AuditLogManager {
    if (!AuditLogManager.instance) {
      AuditLogManager.instance = new AuditLogManager();
    }
    return AuditLogManager.instance;
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
   * Cleans up old log files if there are too many.
   */
  private async rotateLogs(): Promise<void> {
    try {
      const files = await readdir(this.logDirectory);
      if (!files) return;
      const logFiles = files.filter((f) => f.startsWith("ecosystem_logs_") && f.endsWith(".jsonl"));

      if (logFiles.length > MAX_LOG_FILES) {
        // Sort files by date (oldest first, assuming YYYY-MM-DD naming convention)
        logFiles.sort();
        const filesToDelete = logFiles.slice(0, logFiles.length - MAX_LOG_FILES);

        for (const file of filesToDelete) {
          await unlink(join(this.logDirectory, file));
        }
      }
    } catch (error) {
      console.error("Failed to rotate ecosystem logs:", error);
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

      // Attempt background rotation occasionally (or every time, since it's non-blocking mostly)
      this.rotateLogs().catch(console.error);

    } catch (error) {
      console.error("Failed to write to ecosystem audit log:", error);
    }
  }

  public async flush(): Promise<void> {
    // Currently a no-op as writes are direct
  }
}

// Export a default instance for convenience
export const auditLogger = AuditLogManager.getInstance();
