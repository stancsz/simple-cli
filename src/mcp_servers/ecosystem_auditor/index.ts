import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { generateEcosystemAuditReport } from "./tools/generate_audit_report.js";
import { generateEcosystemAuditReportSchema } from "./schemas/generate_audit_report.js";
import { executeLogEcosystemEvent } from "./tools/log_event.js";
import { logEcosystemEventSchema } from "./schemas/log_event.js";
import { zodToJsonSchema } from "zod-to-json-schema";

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
            focus_area: { type: "string", enum: ["communications", "policy_changes", "morphology_adjustments", "all"], description: "The specific area to focus the audit on." }
          },
          required: ["timeframe"]
        }
      },
      {
        name: "log_ecosystem_event",
        description: "Logs a significant ecosystem event such as agency spawning, policy changes, or cross-agency communication.",
        inputSchema: zodToJsonSchema(logEcosystemEventSchema) as any
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "log_ecosystem_event") {
    const input = logEcosystemEventSchema.parse(request.params.arguments);
    const result = await executeLogEcosystemEvent(input);
    if (!result.success) {
      return {
        content: [{ type: "text", text: result.message }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: result.message }]
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
