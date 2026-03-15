import { z } from "zod";
import { auditLogger } from "./log_manager.js";
import { EcosystemAuditLogEntry, EcosystemAuditReport } from "./types.js";
import { promises as fs } from "fs";
import { join } from "path";
import { createLLM } from "../../llm/index.js";

// --- Schemas ---

export const logEcosystemEventSchema = z.object({
  event_type: z.string().describe("The type of event (e.g., 'communication', 'policy_change', 'spawn', 'merge', 'retire')."),
  source_agency: z.string().describe("The ID of the agency originating the event."),
  target_agency: z.string().optional().describe("The ID of the target agency (if applicable)."),
  data: z.union([z.string(), z.record(z.any())]).describe("A JSON string or object containing the event details."),
  timestamp: z.string().optional().describe("ISO 8601 timestamp. Will default to current time if omitted.")
});

export type LogEcosystemEventInput = z.infer<typeof logEcosystemEventSchema>;

export const generateEcosystemAuditReportSchema = z.object({
  timeframe: z.string().describe("The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'."),
  focus_area: z.enum(["communications", "policy_changes", "morphology_adjustments", "all"]).optional().default("all")
});

export type GenerateEcosystemAuditReportInput = z.infer<typeof generateEcosystemAuditReportSchema>;

// --- Tool Implementations ---

/**
 * Executes the log_ecosystem_event tool logic.
 * Parses the data (if it's a string) and logs the event asynchronously via the AuditLogManager.
 */
export async function executeLogEcosystemEvent(input: LogEcosystemEventInput): Promise<{ success: boolean; message: string }> {
  try {
    let parsedData = input.data;

    if (typeof input.data === "string") {
      try {
        parsedData = JSON.parse(input.data);
      } catch {
        // Fallback to storing as a raw string if it's not valid JSON
        parsedData = { raw: input.data };
      }
    }

    const eventToLog: EcosystemAuditLogEntry = {
      timestamp: input.timestamp || new Date().toISOString(),
      event_type: input.event_type,
      source_agency: input.source_agency,
      target_agency: input.target_agency,
      data: parsedData,
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

// Helper to determine the start date from the timeframe string
export function getStartDateFromTimeframe(timeframe: string): Date {
    const now = new Date();
    if (timeframe.includes("24_hours")) {
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("7_days")) {
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeframe.includes("30_days")) {
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    // Default to epoch if format is unrecognized, to include all
    return new Date(0);
}

// Helper to check if an event matches the focus area
export function matchesFocusArea(event: EcosystemAuditLogEntry, focus_area: string): boolean {
    if (focus_area === "all") return true;

    const type = event.event_type.toLowerCase();

    if (focus_area === "communications") {
        return type === "communication" || type === "message" || type === "rpc";
    }
    if (focus_area === "policy_changes") {
        return type === "policy_change" || type === "policy_update";
    }
    if (focus_area === "morphology_adjustments") {
        return type === "morphology_adjustment" || type === "spawn" || type === "merge" || type === "retire" || type === "scale";
    }

    return true; // fallback
}

/**
 * Reads and parses the audit log JSONL files, returning filtered entries.
 */
export async function readAndFilterLogs(startDate: Date, focusArea: string): Promise<EcosystemAuditLogEntry[]> {
    const logDir = process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent');
    const logsDirPath = join(logDir, 'ecosystem_logs');

    let entries: EcosystemAuditLogEntry[] = [];

    try {
        const files = await fs.readdir(logsDirPath);
        const logFiles = files.filter(f => f.startsWith("ecosystem_logs_") && f.endsWith(".jsonl"));

        for (const file of logFiles) {
             const filePath = join(logsDirPath, file);
             const fileContent = await fs.readFile(filePath, 'utf-8');
             const lines = fileContent.split('\n').filter(line => line.trim() !== '');

             const fileEntries: EcosystemAuditLogEntry[] = lines.map(line => {
                try {
                    return JSON.parse(line) as EcosystemAuditLogEntry;
                } catch (e) {
                    return null;
                }
             }).filter((entry): entry is EcosystemAuditLogEntry => entry !== null);

             entries = entries.concat(fileEntries);
        }

        // Filter by timestamp and focus area
        return entries.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            if (entryDate < startDate) return false;
            return matchesFocusArea(entry, focusArea);
        });

    } catch (e: any) {
        if (e.code === 'ENOENT') {
            console.warn(`Audit logs directory not found at ${logsDirPath}`);
            return [];
        }
        throw e;
    }
}

/**
 * Generates an ecosystem audit report based on cross-agency logs and metrics.
 *
 * @param {GenerateEcosystemAuditReportInput} input - The input parameters containing timeframe and focus area.
 * @returns {Promise<EcosystemAuditReport>} A promise resolving to the generated audit report.
 */
export async function generateEcosystemAuditReport(input: GenerateEcosystemAuditReportInput): Promise<EcosystemAuditReport> {
    const startDate = getStartDateFromTimeframe(input.timeframe);
    const focusArea = input.focus_area || 'all';

    // Read and filter log entries
    const logs = await readAndFilterLogs(startDate, focusArea);

    // Group logs safely (capped to avoid blowing up prompt)
    const MAX_LOGS_TO_PROCESS = 500;
    const cappedLogs = logs.slice(0, MAX_LOGS_TO_PROCESS);

    let summaryMarkdown = `_No logs found for timeframe: ${input.timeframe} and focus area: ${focusArea}_`;

    if (cappedLogs.length > 0) {
        // Construct LLM Prompt for synthesis
        const llm = createLLM();

        const systemPrompt = `You are the Ecosystem Auditor for a multi-agent digital biosphere.
Your goal is to analyze the provided ecosystem audit logs and generate a synthesized, human-readable report highlighting key events, policy changes, morphology adjustments, and potential anomalies across the child agency ecosystem.

Format the output strictly as a Markdown document with the following sections:
## Executive Summary
(A brief narrative overview of ecosystem health and major activities)

## Key Events
(Bullet points summarizing significant cross-agency communications and task completions)

## Policy Changes
(Any updates to operating parameters, strategic pivots, or swarm configurations)

## Morphology Adjustments
(Summarize any agency spawning, merging, retiring, or scaling actions)

## Anomalies & Risks
(Identify high error rates, frequent restarts, deadlocks, or unusual patterns)

## Recommendations
(Actionable steps for the root agency to optimize ecosystem performance or address risks)

Respond ONLY with the Markdown string, no other conversational text.`;

        const userPrompt = `Here are the audit logs for the timeframe: ${input.timeframe} and focus area: ${focusArea}. Total logs provided: ${cappedLogs.length}.

Logs (JSON lines):
${cappedLogs.map(l => JSON.stringify(l)).join('\n')}

Generate the comprehensive ecosystem audit report.`;

        try {
            const response = await llm.generate(
                systemPrompt,
                [{ role: 'user', content: userPrompt }]
            );

            summaryMarkdown = response.raw.trim();
        } catch (e: any) {
            console.error("Failed to generate audit report via LLM:", e);
            summaryMarkdown = `_Error generating report synthesis via LLM: ${e.message}_`;
        }
    }

    return {
        report_id: `audit-${Date.now()}`,
        timeframe: input.timeframe,
        focus_area: focusArea,
        summary: summaryMarkdown,
        events: cappedLogs
    };
}
