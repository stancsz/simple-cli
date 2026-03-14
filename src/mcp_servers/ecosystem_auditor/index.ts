import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { generateEcosystemAuditReport, generateEcosystemAuditReportSchema, logAuditEventSchema } from "./tools.js";
import { auditLogger } from "./audit_logger.js";

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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_ecosystem_audit_report",
        description: "Synthesizes cross-agency communications, policy changes, and morphology adjustments into an actionable audit report.",
        inputSchema: {
          type: "object",
          properties: {
            timeframe: { type: "string", description: "The timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'." },
            focus_area: { type: "string", enum: ["communications", "policy_changes", "morphology_adjustments", "all"], description: "The specific area to focus the audit on." },
            agency_id: { type: "string", description: "Filter logs to a specific agency." }
          },
          required: ["timeframe"]
        }
      },
      {
        name: "log_audit_event",
        description: "Logs a cross-agency communication, policy change, or morphology adjustment event.",
        inputSchema: {
          type: "object",
          properties: {
            event_type: { type: "string", enum: ["cross_agency_communication", "policy_change", "morphology_adjustment", "resource_allocation", "anomaly_detected", "system_event"] },
            source_agency: { type: "string" },
            target_agency: { type: "string" },
            agencies_involved: { type: "array", items: { type: "string" } },
            payload: { type: "object", description: "Flexible payload containing event details." }
          },
          required: ["event_type", "payload"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate_ecosystem_audit_report") {
    const input = generateEcosystemAuditReportSchema.parse(request.params.arguments);
    const report = await generateEcosystemAuditReport(input);
    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }]
    };
  }

  if (request.params.name === "log_audit_event") {
    const input = logAuditEventSchema.parse(request.params.arguments);
    const event = await auditLogger.logEvent(input);
    return {
      content: [{ type: "text", text: JSON.stringify(event, null, 2) }]
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
