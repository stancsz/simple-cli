import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    createMultiAgencyProject,
    assignAgencyToTask,
    monitorProjectStatus,
    resolveInterAgencyDependency
} from "./tools/index.js";
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
      "create_multi_agency_project",
      "Parses a project specification (JSON) defining tasks, dependencies, and required agency roles, storing it in Brain memory and returning a project ID.",
      {
        project_spec: z.string().describe("JSON string representing the ProjectSpec with name and tasks.")
      },
      async ({ project_spec }: { project_spec: string }) => {
        try {
            const projectId = await createMultiAgencyProject(project_spec, this.memory);
            return { content: [{ type: "text", text: JSON.stringify({ project_id: projectId }, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "assign_agency_to_task",
      "Uses the Agency Spawning Protocol to spawn or assign an existing child agency to a specific project task.",
      {
        project_id: z.string(),
        task_id: z.string(),
        agency_config: z.object({
            agency_id: z.string().optional(),
            role: z.string(),
            initial_context: z.string(),
            resource_limit: z.number()
        }).describe("Configuration mapping role and context constraints. Pass agency_id to use an existing agency, or omit to spawn a new one.")
      },
      async ({ project_id, task_id, agency_config }: { project_id: string; task_id: string; agency_config: { agency_id?: string; role: string; initial_context: string; resource_limit: number; } }) => {
        try {
            const assignmentId = await assignAgencyToTask(project_id, task_id, agency_config, this.memory);
            return { content: [{ type: "text", text: JSON.stringify({ assignment_id: assignmentId }, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "monitor_project_status",
      "Aggregates status from all assigned agencies and returns overall progress, blockers, and project health.",
      {
        project_id: z.string()
      },
      async ({ project_id }: { project_id: string }) => {
        try {
            const statusObj = await monitorProjectStatus(project_id, this.memory);
            return { content: [{ type: "text", text: JSON.stringify(statusObj, null, 2) }] };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "resolve_inter_agency_dependency",
      "Handles and resolves dependencies between tasks assigned to different agencies.",
      {
        project_id: z.string(),
        dependency: z.object({
            task_id: z.string(),
            depends_on_task_id: z.string(),
            resolution_status: z.enum(["unresolved", "resolved"])
        }).describe("The dependency object outlining what task is blocked by what task.")
      },
      async ({ project_id, dependency }: { project_id: string; dependency: { task_id: string; depends_on_task_id: string; resolution_status: "unresolved" | "resolved" } }) => {
        try {
            await resolveInterAgencyDependency(project_id, dependency, this.memory);
            return { content: [{ type: "text", text: "Dependency successfully resolved." }] };
        } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
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
