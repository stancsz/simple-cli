import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  generateEcosystemAuditReport,
  generateEcosystemAuditReportSchema,
  logAuditEventSchema,
  queryAuditLogsSchema,
  exportAuditTrailSchema,
  AuditEvent
} from "./tools.js";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync, statSync } from "fs";

/**
 * The Ecosystem Auditor MCP Server instance.
 * Provides tools for auditing and monitoring ecosystem topology and decisions.
 */
const server = new Server(
  {
    name: "ecosystem_auditor",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for log rotation

async function getLogFilePath(): Promise<string> {
  const agentDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), ".agent");
  const auditDir = path.join(agentDir, "audit_logs");
  await fs.mkdir(auditDir, { recursive: true });

  const activeLogPath = path.join(auditDir, "audit_trail.jsonl");

  if (existsSync(activeLogPath)) {
    const stats = statSync(activeLogPath);
    if (stats.size > MAX_LOG_SIZE_BYTES) {
      const archivedLogPath = path.join(auditDir, `audit_trail_${Date.now()}.jsonl`);
      await fs.rename(activeLogPath, archivedLogPath);
    }
  }

  return activeLogPath;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "log_audit_event",
        description: "Logs a cross-agency communication, policy change, or morphology adjustment.",
        inputSchema: {
          type: "object",
          properties: {
            event_type: { type: "string", enum: ["agency_spawn", "agency_merge", "agency_retire", "inter_agency_call", "policy_change", "morphology_adjustment"] },
            source_agency: { type: "string" },
            target_agency: { type: "string" },
            data: { type: "object", description: "The structured data payload of the event." },
            metadata: { type: "object" }
          },
          required: ["event_type", "data"]
        }
      },
      {
        name: "query_audit_logs",
        description: "Queries the ecosystem audit logs by time range, event type, or agency ID.",
        inputSchema: {
          type: "object",
          properties: {
            time_range: {
              type: "object",
              properties: {
                start: { type: "number" },
                end: { type: "number" }
              }
            },
            event_type: { type: "string", enum: ["agency_spawn", "agency_merge", "agency_retire", "inter_agency_call", "policy_change", "morphology_adjustment"] },
            agency_id: { type: "string" }
          }
        }
      },
      {
        name: "export_audit_trail",
        description: "Exports the complete audit trail in the specified format (json or csv).",
        inputSchema: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["json", "csv"] }
          },
          required: ["format"]
        }
      },
      {
        name: "generate_ecosystem_audit_report",
        description: "Synthesizes cross-agency communications, policy changes, and morphology adjustments into an actionable audit report.",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: { type: "string", description: "The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'." },
            focus_area: { type: "string", enum: ["communications", "policy_changes", "morphology_adjustments", "all"], description: "The specific area to focus the audit on." }
          },
          required: ["timeframe"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "log_audit_event") {
    const input = logAuditEventSchema.parse(request.params.arguments);
    const logFilePath = await getLogFilePath();

    const event: AuditEvent = {
      timestamp: Date.now(),
      event_type: input.event_type,
      source_agency: input.source_agency,
      target_agency: input.target_agency,
      data: input.data,
      metadata: input.metadata
    };

    await fs.appendFile(logFilePath, JSON.stringify(event) + "\n", "utf8");

    return {
      content: [{ type: "text", text: "Audit event logged successfully." }]
    };
  }

  if (request.params.name === "query_audit_logs") {
    const input = queryAuditLogsSchema.parse(request.params.arguments);

    const agentDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), ".agent");
    const auditDir = path.join(agentDir, "audit_logs");

    let allLogs: AuditEvent[] = [];

    if (existsSync(auditDir)) {
      const files = await fs.readdir(auditDir);
      const logFiles = files.filter(f => f.startsWith("audit_trail") && f.endsWith(".jsonl"));

      for (const file of logFiles) {
        const filePath = path.join(auditDir, file);
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split("\n").filter(line => line.trim().length > 0);

        for (const line of lines) {
          try {
            const event: AuditEvent = JSON.parse(line);
            allLogs.push(event);
          } catch (e) {
            console.warn(`Failed to parse log line in ${file}:`, line);
          }
        }
      }
    }

    // Filter
    let filteredLogs = allLogs;

    if (input.time_range) {
      if (input.time_range.start !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= input.time_range!.start!);
      }
      if (input.time_range.end !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= input.time_range!.end!);
      }
    }

    if (input.event_type) {
      filteredLogs = filteredLogs.filter(log => log.event_type === input.event_type);
    }

    if (input.agency_id) {
      filteredLogs = filteredLogs.filter(log =>
        log.source_agency === input.agency_id || log.target_agency === input.agency_id
      );
    }

    // Sort by timestamp descending
    filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

    return {
      content: [{ type: "text", text: JSON.stringify(filteredLogs, null, 2) }]
    };
  }

  if (request.params.name === "export_audit_trail") {
    const input = exportAuditTrailSchema.parse(request.params.arguments);

    const agentDir = process.env.JULES_AGENT_DIR || path.join(process.cwd(), ".agent");
    const auditDir = path.join(agentDir, "audit_logs");

    let allLogs: AuditEvent[] = [];

    if (existsSync(auditDir)) {
      const files = await fs.readdir(auditDir);
      const logFiles = files.filter(f => f.startsWith("audit_trail") && f.endsWith(".jsonl"));

      for (const file of logFiles) {
        const filePath = path.join(auditDir, file);
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split("\n").filter(line => line.trim().length > 0);

        for (const line of lines) {
          try {
            const event: AuditEvent = JSON.parse(line);
            allLogs.push(event);
          } catch (e) {
            console.warn(`Failed to parse log line in ${file}:`, line);
          }
        }
      }
    }

    allLogs.sort((a, b) => a.timestamp - b.timestamp);

    let exportContent = "";

    if (input.format === "json") {
      exportContent = JSON.stringify(allLogs, null, 2);
    } else if (input.format === "csv") {
      const headers = ["timestamp", "event_type", "source_agency", "target_agency", "data", "metadata"];
      exportContent = headers.join(",") + "\n";

      for (const log of allLogs) {
        const row = [
          log.timestamp,
          log.event_type,
          log.source_agency || "",
          log.target_agency || "",
          `"${JSON.stringify(log.data).replace(/"/g, '""')}"`,
          log.metadata ? `"${JSON.stringify(log.metadata).replace(/"/g, '""')}"` : ""
        ];
        exportContent += row.join(",") + "\n";
      }
    }

    return {
      content: [{ type: "text", text: exportContent }]
    };
  }

  if (request.params.name === "generate_ecosystem_audit_report") {
    const input = generateEcosystemAuditReportSchema.parse(request.params.arguments);
    const report = await generateEcosystemAuditReport(input);
    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }]
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
});

/**
 * Starts the Ecosystem Auditor MCP server over Stdio transport.
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ecosystem Auditor MCP server running on stdio");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}

export { server }; // For testing
