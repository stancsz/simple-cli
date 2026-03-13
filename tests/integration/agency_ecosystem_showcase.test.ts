import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgencyOrchestratorServer } from "../../src/mcp_servers/agency_orchestrator/index.js";
import { updateTaskStatus } from "../../src/mcp_servers/agency_orchestrator/tools/index.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import fs from "fs";
import path from "path";

// Global mocked memory store map
let mockDatabase: Record<string, any> = {};

vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() {}

      async init() {
          return true;
      }

      async store(id: string, request: string, solution: string, tags: string[], namespace: string) {
        mockDatabase[id] = { id, request, solution, tags, namespace };
        return true;
      }

      async recall(topic: string, limit: number, namespace: string) {
        // Return matches from mockDatabase
        return Object.values(mockDatabase).filter(entry => entry.id.includes(topic) || entry.id === topic);
      }
    }
  };
});

// Mock fs to avoid creating actual child agency folders during tests
vi.mock("fs/promises", () => {
    return {
        mkdir: vi.fn().mockResolvedValue(true)
    };
});

describe("Phase 33 Showcase Validation: Agency Ecosystem Demonstration", () => {
    let server: AgencyOrchestratorServer;
    let config: any;
    let spec: string;

    beforeEach(() => {
        mockDatabase = {}; // Reset state
        server = new AgencyOrchestratorServer();

        const configPath = path.join(process.cwd(), "demos/agency_ecosystem_showcase/showcase_config.json");
        const specPath = path.join(process.cwd(), "demos/agency_ecosystem_showcase/complex_project_spec.json");

        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        spec = fs.readFileSync(specPath, 'utf8');
    });

    async function callTool(name: string, args: any) {
        // Access the registered tools directly to bypass SDK transport complexities in unit testing
        // @ts-ignore
        const tools = server.server._server?.tools || server.server.registeredTools || server.server.toolMap || server.server.tools;

        let handler;
        if (tools && typeof tools.get === 'function') {
            const t = tools.get(name);
            if (t) handler = t.handler || t.callback;
        } else if (tools && tools[name]) {
            handler = tools[name].handler || tools[name].callback;
        } else if (Array.isArray(tools)) {
            const t = tools.find(x => x.name === name);
            if (t) handler = t.handler || t.callback;
        } else {
            // Fallback
            const mcpTools = await import("../../src/mcp_servers/agency_orchestrator/tools/index.js");
            if (name === "create_multi_agency_project") return { content: [{ text: JSON.stringify({ project_id: await mcpTools.createMultiAgencyProject(args.project_spec, server['memory']) }) }] };
            if (name === "assign_agency_to_task") return { content: [{ text: JSON.stringify({ assignment_id: await mcpTools.assignAgencyToTask(args.project_id, args.task_id, args.agency_config, server['memory']) }) }] };
            if (name === "monitor_project_status") return { content: [{ text: JSON.stringify(await mcpTools.monitorProjectStatus(args.project_id, server['memory'])) }] };
            if (name === "resolve_inter_agency_dependency") {
                await mcpTools.resolveInterAgencyDependency(args.project_id, args.dependency, server['memory']);
                return { content: [{ text: "Dependency successfully resolved." }] };
            }
        }

        if(!handler) throw new Error(`Tool ${name} handler not found`);
        return await handler(args);
    }

    it("should fully orchestrate the showcase multi-agency project", async () => {
        // 1. Create Project
        const createRes = await callTool("create_multi_agency_project", { project_spec: spec });
        expect(createRes.isError).toBeFalsy();
        const projectId = JSON.parse(createRes.content[0].text).project_id;
        expect(projectId).toBeDefined();

        // 2. Assign Tasks
        const assignments: Record<string, string> = {
            api_schema: "agency_backend",
            backend_api: "agency_backend",
            frontend_ui: "agency_frontend",
            docker_build: "agency_devops",
            ci_pipeline: "agency_devops"
        };

        for (const [taskId, agencyId] of Object.entries(assignments)) {
            const agencyConfig = config.agencies.find((a: any) => a.id === agencyId);
            const assignRes = await callTool("assign_agency_to_task", {
                project_id: projectId,
                task_id: taskId,
                agency_config: {
                    agency_id: agencyId,
                    role: agencyConfig.niche,
                    initial_context: agencyConfig.mission,
                    resource_limit: agencyConfig.initial_budget_tokens
                }
            });
            expect(assignRes.isError).toBeFalsy();
        }

        // 3. Monitor and Execute
        let statusRes = await callTool("monitor_project_status", { project_id: projectId });
        let status = JSON.parse(statusRes.content[0].text);
        expect(status.overall_progress).toBe(0);

        // Assert initial dependencies (backend and frontend blocked by api_schema)
        let backendTask = status.tasks.find((t: any) => t.task_id === "backend_api");
        expect(backendTask.is_blocked).toBe(true);

        // Complete api_schema
        await updateTaskStatus(projectId, "api_schema", "completed", server['memory']);

        await callTool("resolve_inter_agency_dependency", {
            project_id: projectId,
            dependency: { task_id: "backend_api", depends_on_task_id: "api_schema", resolution_status: "resolved"}
        });
        await callTool("resolve_inter_agency_dependency", {
            project_id: projectId,
            dependency: { task_id: "frontend_ui", depends_on_task_id: "api_schema", resolution_status: "resolved"}
        });

        statusRes = await callTool("monitor_project_status", { project_id: projectId });
        status = JSON.parse(statusRes.content[0].text);
        backendTask = status.tasks.find((t: any) => t.task_id === "backend_api");
        expect(backendTask.is_blocked).toBe(false);

        // Complete parallel tasks
        await updateTaskStatus(projectId, "backend_api", "completed", server['memory']);
        await updateTaskStatus(projectId, "frontend_ui", "completed", server['memory']);

        // Resolve dependencies for docker
        await callTool("resolve_inter_agency_dependency", {
            project_id: projectId,
            dependency: { task_id: "docker_build", depends_on_task_id: "backend_api", resolution_status: "resolved"}
        });
        await callTool("resolve_inter_agency_dependency", {
            project_id: projectId,
            dependency: { task_id: "docker_build", depends_on_task_id: "frontend_ui", resolution_status: "resolved"}
        });

        // Fail docker task to test deadlock handling
        // We set docker to failed, and ci_pipeline to in_progress so that the deadlock detection triggers
        // Deadlock detection is true if a dependency is unresolved, dependent is "in_progress", and depending is "failed"
        await updateTaskStatus(projectId, "docker_build", "failed", server['memory']);
        await updateTaskStatus(projectId, "ci_pipeline", "in_progress", server['memory']);

        statusRes = await callTool("monitor_project_status", { project_id: projectId });
        status = JSON.parse(statusRes.content[0].text);

        // Assert failure and deadlock resolution trigger correctly
        expect(status.status).toBe("failed");
        expect(status.blockers.length).toBeGreaterThan(0);

        // Recover docker task
        await updateTaskStatus(projectId, "docker_build", "completed", server['memory']);
        await callTool("resolve_inter_agency_dependency", {
            project_id: projectId,
            dependency: { task_id: "ci_pipeline", depends_on_task_id: "docker_build", resolution_status: "resolved"}
        });

        // Complete final task
        await updateTaskStatus(projectId, "ci_pipeline", "completed", server['memory']);

        statusRes = await callTool("monitor_project_status", { project_id: projectId });
        status = JSON.parse(statusRes.content[0].text);

        // Assert full completion
        expect(status.status).toBe("completed");
        expect(status.overall_progress).toBe(1);
    });
});