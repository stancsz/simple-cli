import { AgencyOrchestratorServer } from "../../src/mcp_servers/agency_orchestrator/index.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import fs from "fs";
import path from "path";

// Extract tools logic, since we are using this programmatically for the showcase
import {
    createMultiAgencyProject,
    assignAgencyToTask,
    monitorProjectStatus,
    resolveInterAgencyDependency,
    updateTaskStatus
} from "../../src/mcp_servers/agency_orchestrator/tools/index.js";

async function main() {
    console.log("Starting Phase 33 Agency Ecosystem Showcase...\n");
    const configPath = path.join(process.cwd(), "demos/agency_ecosystem_showcase/showcase_config.json");
    const specPath = path.join(process.cwd(), "demos/agency_ecosystem_showcase/complex_project_spec.json");

    if (!fs.existsSync(configPath) || !fs.existsSync(specPath)) {
        console.error("Missing config or spec files.");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const spec = fs.readFileSync(specPath, 'utf8');

    // Setup an ephemeral memory for the showcase
    const memory = new EpisodicMemory(path.join(process.cwd(), ".agent", "showcase_brain"));
    await memory.init();

    console.log(`--- Project: ${config.project_name} ---`);
    console.log(`Loaded specification for ${config.agencies.length} specialized agencies.\n`);

    // 1. Create Project
    console.log("[1] Orchestrator: Parsing Project Specification...");
    const projectId = await createMultiAgencyProject(spec, memory);
    console.log(`    Project Created! ID: ${projectId}\n`);

    // 2. Spawning & Assignment
    console.log("[2] Orchestrator: Spawning Child Agencies & Assigning Tasks...");

    // Assign tasks to respective agencies based on config
    const assignments: Record<string, string> = {
        api_schema: "agency_backend",
        backend_api: "agency_backend",
        frontend_ui: "agency_frontend",
        docker_build: "agency_devops",
        ci_pipeline: "agency_devops"
    };

    for (const [taskId, agencyId] of Object.entries(assignments)) {
        const agencyConfig = config.agencies.find((a: any) => a.id === agencyId);
        if (agencyConfig) {
             console.log(`    -> Spawning & Assigning task '${taskId}' to ${agencyId} [Role: ${agencyConfig.niche}]`);
             await assignAgencyToTask(projectId, taskId, {
                 agency_id: agencyId, // passing this avoids actual fs spawning in demo, treats as existing
                 role: agencyConfig.niche,
                 initial_context: agencyConfig.mission,
                 resource_limit: agencyConfig.initial_budget_tokens
             }, memory);
        }
    }
    console.log("");

    // 3. Execution & Monitoring Loop
    console.log("[3] Execution Loop: Monitoring Cross-Agency Progress...");

    let status = await monitorProjectStatus(projectId, memory);
    console.log(`    Initial Status: Progress ${status.overall_progress * 100}%`);

    // Simulate Backend completing schema
    console.log(`\n    -> [${assignments.api_schema}] working on 'api_schema'... done.`);
    await updateTaskStatus(projectId, "api_schema", "completed", memory);

    // Resolve dependencies for backend_api and frontend_ui
    console.log("    -> Orchestrator resolving inter-agency dependencies on 'api_schema'...");
    await resolveInterAgencyDependency(projectId, { task_id: "backend_api", depends_on_task_id: "api_schema", resolution_status: "resolved"}, memory);
    await resolveInterAgencyDependency(projectId, { task_id: "frontend_ui", depends_on_task_id: "api_schema", resolution_status: "resolved"}, memory);

    status = await monitorProjectStatus(projectId, memory);
    console.log(`    Current Status: Progress ${status.overall_progress * 100}%`);

    // Simulate parallel completion of backend and frontend
    console.log(`\n    -> [${assignments.backend_api}] working on 'backend_api'... done.`);
    await updateTaskStatus(projectId, "backend_api", "completed", memory);
    console.log(`    -> [${assignments.frontend_ui}] working on 'frontend_ui'... done.`);
    await updateTaskStatus(projectId, "frontend_ui", "completed", memory);

    // Resolve dependencies for docker_build
    console.log("    -> Orchestrator resolving inter-agency dependencies on 'docker_build'...");
    await resolveInterAgencyDependency(projectId, { task_id: "docker_build", depends_on_task_id: "backend_api", resolution_status: "resolved"}, memory);
    await resolveInterAgencyDependency(projectId, { task_id: "docker_build", depends_on_task_id: "frontend_ui", resolution_status: "resolved"}, memory);

    status = await monitorProjectStatus(projectId, memory);
    console.log(`    Current Status: Progress ${status.overall_progress * 100}%`);

    // Conflict Simulation
    console.log("\n[4] Simulating Resource Conflict...");
    console.log(`    -> [${assignments.docker_build}] Agency DevOps exceeded token budget during docker build!`);
    await updateTaskStatus(projectId, "docker_build", "failed", memory);

    status = await monitorProjectStatus(projectId, memory);
    console.log("    -> Deadlock detected by Orchestrator!");

    console.log("    -> Meta-Orchestrator invokes Strategic Decision Engine... (Simulated)");
    console.log("    -> Reallocating budget to DevOps Agency...");
    console.log("    -> Conflict resolved. Resuming task...");
    await updateTaskStatus(projectId, "docker_build", "completed", memory);

    // Resolve final dependency
    console.log("    -> Orchestrator resolving inter-agency dependency on 'ci_pipeline'...");
    await resolveInterAgencyDependency(projectId, { task_id: "ci_pipeline", depends_on_task_id: "docker_build", resolution_status: "resolved"}, memory);

    // Complete final task
    console.log(`\n    -> [${assignments.ci_pipeline}] working on 'ci_pipeline'... done.`);
    await updateTaskStatus(projectId, "ci_pipeline", "completed", memory);

    status = await monitorProjectStatus(projectId, memory);
    console.log(`\n    Final Status: ${status.status.toUpperCase()} (Progress ${status.overall_progress * 100}%)`);

    // 5. Dashboard Generation
    console.log("\n[5] Generating Project Dashboard...");
    const dashboard = `# Project Dashboard: ${config.project_name}
Status: COMPLETE
Final Progress: 100%

## Agency Status
- **${config.agencies[0].id}** (${config.agencies[0].niche}): Complete
- **${config.agencies[1].id}** (${config.agencies[1].niche}): Complete
- **${config.agencies[2].id}** (${config.agencies[2].niche}): Complete - *Budget dynamically adjusted during Docker build*

## Cross-Agency Patterns Identified
- Mocking API schemas early accelerates parallel development between Backend and Frontend agencies.
- Multi-stage Docker builds require coordinated delivery of frontend static assets and backend binaries.
`;

    fs.writeFileSync(path.join(process.cwd(), "demos/agency_ecosystem_showcase/PROJECT_DASHBOARD.md"), dashboard);
    console.log("    -> Saved to PROJECT_DASHBOARD.md");

    console.log("\nShowcase Completed Successfully!");
}

main().catch(console.error);
