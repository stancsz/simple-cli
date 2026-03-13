import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { orchestrateComplexProject, resolveAgencyConflict, generateProjectDashboard } from "./tools/index.js";
import { EpisodicMemory } from "../../brain/episodic.js";

export class AgencyOrchestratorServer {
  public server: McpServer;
  private memory: EpisodicMemory;

  constructor() {
    this.server = new McpServer({
      name: "agency_orchestrator",
      version: "1.0.0",
    });
    this.memory = new EpisodicMemory();

    this.server.tool(
      "orchestrate_complex_project",
      "Parses a project specification and delegates sub-tasks to specialized child agencies.",
      {
        project_spec: z.any().describe("The JSON object containing project tasks and descriptions."),
        child_agencies: z.array(z.string()).describe("List of available child agency IDs to delegate to.")
      },
      async ({ project_spec, child_agencies }) => {
        const result = await orchestrateComplexProject(project_spec, child_agencies);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "resolve_agency_conflict",
      "Resolves a resource conflict between two agencies using the strategic decision engine.",
      {
        agency_a: z.string(),
        agency_b: z.string(),
        resource_type: z.string(),
        context: z.string()
      },
      async ({ agency_a, agency_b, resource_type, context }) => {
        const result = await resolveAgencyConflict(agency_a, agency_b, resource_type, context, this.memory);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    this.server.tool(
      "generate_project_dashboard",
      "Aggregates metrics from all child agencies into a markdown project dashboard.",
      {
        project_id: z.string(),
        agency_metrics: z.record(z.any())
      },
      async ({ project_id, agency_metrics }) => {
        const result = await generateProjectDashboard(project_id, agency_metrics);
        return { content: [{ type: "text", text: result }] };
      }
    );
  }

  async start() {
    console.error("Starting Agency-Orchestrator MCP Server...");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agency-Orchestrator MCP Server running on stdio");
  }
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === process.argv[1]) {
  const server = new AgencyOrchestratorServer();
  server.start().catch((error) => {
    console.error("Fatal error starting Agency-Orchestrator server:", error);
    process.exit(1);
  });
}
