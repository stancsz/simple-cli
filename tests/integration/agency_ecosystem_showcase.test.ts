import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { AgencyOrchestratorServer } from "../../src/mcp_servers/agency_orchestrator/index.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { crossAgencyPatternRecognition } from "../../src/mcp_servers/brain/tools/pattern_analysis.js";

// Mock Strategic Decision and Memory
vi.mock("../../src/mcp_servers/brain/tools/strategic_decisions.js", () => ({
  makeStrategicDecisionLogic: vi.fn().mockResolvedValue({
    analysis: {
      confidence_score: 0.95,
      proposed_pivot: { description: "Reallocate 100 unused tokens from DevOps Agency to Backend Agency." }
    }
  })
}));

vi.mock("../../src/brain/episodic.js", () => {
  return {
    EpisodicMemory: class {
      recall = vi.fn().mockImplementation(async (topic, limit, namespace) => {
        if (topic === "API mocking") {
          return [{ solution: "Mocking API schemas early accelerates parallel development.", taskId: "task_1", namespace }];
        }
        return [];
      });
      store = vi.fn().mockResolvedValue(true);
    }
  };
});

describe("Phase 33 Validation: Agency Ecosystem Showcase", () => {
  let server: AgencyOrchestratorServer;
  let memory: EpisodicMemory;

  beforeAll(() => {
    server = new AgencyOrchestratorServer();
    memory = new EpisodicMemory();
  });

  // Helper to directly invoke the tool implementation from the class
  async function callOrchestratorTool(name: string, args: any) {
     // The tools are typically registered on a Map or Array in the internal _server object of McpServer
     // Since internal structures can be tricky, let's just test the exported functions from the tools directly for this integration test
     // or manually find the handler

     // @ts-ignore
     const tools = server.server.registeredTools || server.server._server?.tools || server.server.tools || server.server.toolMap;

     let toolHandler;
     if (tools && typeof tools.get === 'function') {
         const t = tools.get(name);
         if (t) toolHandler = t.handler || t.callback;
     } else if (tools && tools[name]) {
         toolHandler = tools[name].handler || tools[name].callback;
     } else if (Array.isArray(tools)) {
         const t = tools.find(x => x.name === name);
         if (t) toolHandler = t.handler || t.callback;
     } else {
        // Fallback to directly calling the tool functions we exported
        const toolsModule = await import("../../src/mcp_servers/agency_orchestrator/tools/index.js");
        if (name === "orchestrate_complex_project") return { content: [{text: JSON.stringify(await toolsModule.orchestrateComplexProject(args.project_spec, args.child_agencies))}] };
        if (name === "resolve_agency_conflict") return { content: [{text: JSON.stringify(await toolsModule.resolveAgencyConflict(args.agency_a, args.agency_b, args.resource_type, args.context, memory))}] };
        if (name === "generate_project_dashboard") return { content: [{text: await toolsModule.generateProjectDashboard(args.project_id, args.agency_metrics)}] };
     }

     if(!toolHandler) throw new Error(`Tool ${name} handler not found`);
     return await toolHandler(args);
  }

  it("should successfully coordinate frontend, backend, and devops tasks via orchestration tool", async () => {
    const spec = {
      project_id: "demo_01",
      project_name: "Test Project",
      tasks: [
        { agency_id: "agency_frontend", description: "UI" },
        { agency_id: "agency_backend", description: "API" },
        { agency_id: "agency_devops", description: "CI/CD" }
      ]
    };
    const childAgencies = ["agency_frontend", "agency_backend", "agency_devops"];

    const response = await callOrchestratorTool("orchestrate_complex_project", { project_spec: spec, child_agencies: childAgencies });
    expect(response.isError).toBeFalsy();

    const content = JSON.parse((response.content[0] as any).text);
    expect(content.status).toBe("running");
    expect(content.milestones).toHaveLength(3);
    expect(content.milestones[0].agency).toBe("agency_frontend");
  });

  it("should successfully detect and resolve resource conflict between agencies using strategic decision tools", async () => {
    const response = await callOrchestratorTool("resolve_agency_conflict", {
      agency_a: "agency_backend",
      agency_b: "agency_devops",
      resource_type: "tokens",
      context: "Backend exhausted token budget"
    });

    expect(response.isError).toBeFalsy();
    const content = JSON.parse((response.content[0] as any).text);
    expect(content.conflict_resolved).toBe(true);
    expect(content.action_taken).toContain("Reallocate 100 unused tokens");
  });

  it("should generate a comprehensive project dashboard reflecting all agency statuses", async () => {
    const metrics = {
      "agency_frontend": { cost: 320, time: 4500, status: "Complete" },
      "agency_backend": { cost: 700, time: 8200, status: "Complete" }
    };

    const response = await callOrchestratorTool("generate_project_dashboard", {
      project_id: "demo_01",
      agency_metrics: metrics
    });

    expect(response.isError).toBeFalsy();
    const text = (response.content[0] as any).text;
    expect(text).toContain("# Project Dashboard: demo_01");
    expect(text).toContain("**agency_frontend**: Cost 320");
  });

  it("should successfully perform cross-agency pattern recognition using shared memory namespaces", async () => {
    const topic = "API mocking";
    const namespaces = ["agency_frontend", "agency_backend"];

    const result = await crossAgencyPatternRecognition(topic, namespaces, memory);
    expect(result.summary).toContain("Identified 2 cross-agency patterns");
    expect(result.details).toHaveLength(2);
    expect(result.details[0].insight).toContain("Mocking API schemas early");
  });

  describe('Agency Ecosystem Showcase Script Orchestration', () => {
    let runShowcase: any;
    let discoverAgencies: any;
    const baseDir = path.join(process.cwd(), 'demos', 'agency_ecosystem_showcase');
    const agentDir = path.join(baseDir, '.agent');

    beforeAll(async () => {
        const orchestrateModule = await import('../../demos/agency_ecosystem_showcase/orchestrate.js');
        runShowcase = orchestrateModule.runShowcase;
        const federationTools = await import('../../src/mcp_servers/federation/tools.js');
        discoverAgencies = federationTools.discoverAgencies;
        // Clean up any previous runs
        if (fs.existsSync(agentDir)) {
            fs.rmSync(agentDir, { recursive: true, force: true });
        }

        // Mock console.log to avoid cluttering test output, but keep a record of what was logged
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        // Restore console
        vi.restoreAllMocks();
    });

    it('should successfully execute the full multi-agency orchestration showcase', async () => {
        // Mock the LLM to avoid real API calls when the federation protocol wraps the local SwarmServer
        vi.spyOn(await import('../../src/llm.js'), 'createLLM').mockImplementation(() => ({
            generate: vi.fn().mockResolvedValue('{"action": "delegate", "agency_id": "mock_agency"}'),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        }) as any);

        // We mock the global fetch used by delegateTask to simulate successful HTTP RPC delegation
        const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
            return {
                ok: true,
                json: async () => ({ status: 'completed', result: 'Task executed in simulation mock.' })
            } as Response;
        });

        // Run the entire showcase orchestration
        await runShowcase();

        // 1. Verify that the correct number of child agencies were registered via the Federation Protocol
        const registeredAgencies = await discoverAgencies();
        expect(registeredAgencies.length).toBeGreaterThanOrEqual(3);

        const names = registeredAgencies.map(a => a.name);
        expect(names).toContain('Frontend Agency');
        expect(names).toContain('Backend Agency');
        expect(names).toContain('Business Ops Agency');

        // The SwarmServer might attempt to make internal fetch calls during its pre-delegation checks,
        // so we just verify that we successfully completed at least the 3 target RPC delegations
        expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

        // 2. Verify that the file system structure was created for each agency
        // Since agency_id is dynamic, we need to map them back based on the policy file written
        const childAgenciesDir = path.join(agentDir, 'child_agencies');
        const generatedDirs = fs.readdirSync(childAgenciesDir);

        let foundFrontend = false;
        let foundBackend = false;
        let foundBusiness = false;

        for (const dirName of generatedDirs) {
            const agencyPath = path.join(childAgenciesDir, dirName);


            // Should have a policy file copied in
            const policyPath = path.join(agencyPath, 'policy.json');
            expect(fs.existsSync(policyPath)).toBe(true);

            const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

            // Should have an artifacts directory
            const artifactsPath = path.join(agencyPath, 'artifacts');
            expect(fs.existsSync(artifactsPath)).toBe(true);

            // 3. Verify that the correct mock artifacts were generated
            const files = fs.readdirSync(artifactsPath);

            const agencyName = policy.name;
            if (agencyName === 'Frontend Agency') {
                expect(files).toContain('dashboard.vue');
                foundFrontend = true;
            } else if (agencyName === 'Backend Agency') {
                expect(files).toContain('api.js');
                foundBackend = true;
            } else if (agencyName === 'Business Ops Agency') {
                expect(files).toContain('pricing.md');
                foundBusiness = true;
            }
        }

        expect(foundFrontend).toBe(true);
        expect(foundBackend).toBe(true);
        expect(foundBusiness).toBe(true);

        fetchSpy.mockRestore();
    });
  });
});
