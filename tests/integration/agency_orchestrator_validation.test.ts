import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgencyOrchestratorServer } from "../../src/mcp_servers/agency_orchestrator/index.js";
import { updateTaskStatus } from "../../src/mcp_servers/agency_orchestrator/tools/index.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";

// Global mocked memory store map
let mockDatabase: Record<string, any> = {};

vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      constructor() {}

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
vi.mock("fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("fs/promises")>();
    return {
        ...actual,
        mkdir: vi.fn().mockResolvedValue(true),
        appendFile: vi.fn().mockResolvedValue(undefined)
    };
});

// Also mock existsSync if needed by logger
vi.mock("fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("fs")>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true)
    };
});

describe("Phase 33 Validation: Agency Orchestrator Server", () => {
  let server: AgencyOrchestratorServer;

  beforeEach(() => {
    mockDatabase = {}; // Reset state
    server = new AgencyOrchestratorServer();
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

  it("should create a multi-agency project from spec", async () => {
    const spec = {
        name: "Complex SaaS Migration",
        tasks: [
            { task_id: "backend", description: "Migrate DB" },
            { task_id: "frontend", description: "Update UI", dependencies: ["backend"] }
        ]
    };

    const response = await callTool("create_multi_agency_project", { project_spec: JSON.stringify(spec) });
    expect(response.isError).toBeFalsy();

    const content = JSON.parse(response.content[0].text);
    expect(content.project_id).toBeDefined();
    expect(content.project_id).toContain("proj_");

    // Verify written to memory
    expect(mockDatabase[`multi_agency_project_${content.project_id}`]).toBeDefined();
  });

  it("should parse YAML project specs correctly", async () => {
    const yamlSpec = `
name: YAML Project
tasks:
  - task_id: ui
    description: design
`;
    const response = await callTool("create_multi_agency_project", { project_spec: yamlSpec });
    expect(response.isError).toBeFalsy();
    const content = JSON.parse(response.content[0].text);
    expect(content.project_id).toBeDefined();
  });

  it("should spawn and assign agencies to tasks and handle dependencies", async () => {
    const spec = {
        name: "DevOps Pipeline setup",
        tasks: [
            { task_id: "infra", description: "Setup K8s" },
            { task_id: "deploy", description: "Deploy App", dependencies: ["infra"] }
        ]
    };

    const createRes = await callTool("create_multi_agency_project", { project_spec: JSON.stringify(spec) });
    const projectId = JSON.parse(createRes.content[0].text).project_id;

    // Assign infra to a new spawned agency
    const assignInfraRes = await callTool("assign_agency_to_task", {
        project_id: projectId,
        task_id: "infra",
        agency_config: { role: "devops", initial_context: "Use AWS", resource_limit: 100 }
    });
    expect(assignInfraRes.isError).toBeFalsy();

    // Assign deploy to an existing agency
    const assignDeployRes = await callTool("assign_agency_to_task", {
        project_id: projectId,
        task_id: "deploy",
        agency_config: { agency_id: "existing_agency_1", role: "release_manager", initial_context: "Use Helm", resource_limit: 50 }
    });
    expect(assignDeployRes.isError).toBeFalsy();

    const statusRes1 = await callTool("monitor_project_status", { project_id: projectId });
    const status1 = JSON.parse(statusRes1.content[0].text);

    expect(status1.overall_progress).toBe(0);
    const deployTask = status1.tasks.find((t: any) => t.task_id === "deploy");
    expect(deployTask.is_blocked).toBe(true);

    // Update infra task to complete in database
    await updateTaskStatus(projectId, "infra", "completed", server['memory']);

    const resolveRes = await callTool("resolve_inter_agency_dependency", {
        project_id: projectId,
        dependency: { task_id: "deploy", depends_on_task_id: "infra", resolution_status: "resolved" }
    });
    expect(resolveRes.isError).toBeFalsy();

    const statusRes2 = await callTool("monitor_project_status", { project_id: projectId });
    const status2 = JSON.parse(statusRes2.content[0].text);

    const deployTaskUpdated = status2.tasks.find((t: any) => t.task_id === "deploy");
    expect(deployTaskUpdated.is_blocked).toBe(false);
    expect(status2.overall_progress).toBe(0.5); // infra is complete (1 of 2)
  });

  it("should detect dependency deadlocks when a required agency fails", async () => {
      const spec = {
          name: "Deadlock test",
          tasks: [
              { task_id: "A", description: "Task A" },
              { task_id: "B", description: "Task B", dependencies: ["A"] }
          ]
      };

      const createRes = await callTool("create_multi_agency_project", { project_spec: JSON.stringify(spec) });
      const projectId = JSON.parse(createRes.content[0].text).project_id;

      await callTool("assign_agency_to_task", { project_id: projectId, task_id: "A", agency_config: { role: "r", initial_context: "c", resource_limit: 10 } });
      await callTool("assign_agency_to_task", { project_id: projectId, task_id: "B", agency_config: { role: "r", initial_context: "c", resource_limit: 10 } });

      // Task A fails! Task B is pending but waiting on A
      await updateTaskStatus(projectId, "A", "failed", server['memory']);
      await updateTaskStatus(projectId, "B", "in_progress", server['memory']);

      const statusRes = await callTool("monitor_project_status", { project_id: projectId });
      const status = JSON.parse(statusRes.content[0].text);

      expect(status.status).toBe("failed");
      expect(status.blockers.some((b: string) => b.includes("DEADLOCK"))).toBe(true);
  });
});
