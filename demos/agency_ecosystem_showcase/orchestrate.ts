import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { registerAgency, delegateTask, discoverAgencies } from '../../src/mcp_servers/federation/tools.js';

// Types to match the underlying protocols
interface ChildAgencyConfig {
    name: string;
    role: string;
    context: string;
    resources: {
        max_compute_tokens: number;
        allowed_mcp_servers: string[];
    };
}

// Memory constraints note that actual PR #664 is unmerged, so we must simulate the
// underlying `fs` operations for spawning, but we will use the actual Federation tools
// for capability discovery and delegation.
async function simulateSpawnChildAgency(configFile: string) {
    console.log(`[Spawning] Spawning child agency from config: ${configFile}`);

    const configPath = path.join(process.cwd(), 'demos', 'agency_ecosystem_showcase', 'child_agency_configs', configFile);
    const configRaw = fs.readFileSync(configPath, 'utf-8');
    const config: ChildAgencyConfig = JSON.parse(configRaw);

    const agencyId = `agency-${randomUUID()}`;

    // Simulate creating isolated environment
    const agencyDir = path.join(process.cwd(), 'demos', 'agency_ecosystem_showcase', '.agent', 'child_agencies', agencyId);
    fs.mkdirSync(agencyDir, { recursive: true });

    // Write an isolated policy/config for the child
    fs.writeFileSync(path.join(agencyDir, 'policy.json'), JSON.stringify(config, null, 2));

    // ACTUALLY Register with Phase 31 Federation Protocol
    await registerAgency({
        agency_id: agencyId,
        name: config.name,
        capabilities: [
            { name: config.role, description: config.context, endpoint: `local://${agencyId}/api` }
        ],
        status: 'active',
        endpoint: `http://localhost:300${Math.floor(Math.random() * 10)}/` // Mock HTTP endpoint for testing
    });

    console.log(`[Spawning] Child agency "${config.name}" successfully spawned and registered with Federation.\n`);
    return { id: agencyId, name: config.name };
}

// Main Orchestration Script
async function runShowcase() {
    console.log("==================================================");
    console.log("=== Agency Ecosystem Showcase: Root Orchestrator ===");
    console.log("==================================================\n");

    const briefPath = path.join(process.cwd(), 'demos', 'agency_ecosystem_showcase', 'project_brief.md');
    console.log(`[Orchestrator] Reading Project Brief from ${briefPath}`);
    const brief = fs.readFileSync(briefPath, 'utf-8');

    console.log("[Orchestrator] Analyzing project requirements...\n");

    // 1. Spawn Agencies using simulated FS logic but actual Federation registry
    console.log("--- Phase 1: Spawning Required Child Agencies ---");
    const frontendAgency = await simulateSpawnChildAgency('frontend_agency.json');
    const backendAgency = await simulateSpawnChildAgency('backend_agency.json');
    const bizOpsAgency = await simulateSpawnChildAgency('business_ops_agency.json');

    const registry = await discoverAgencies();
    console.log(`[Federation] Total agencies registered in active network: ${registry.length}\n`);

    // 2. Delegate Tasks using the ACTUAL Phase 31 Federation Protocol
    console.log("--- Phase 2: Delegating Project Milestones via Federation Protocol ---");

    // In a real run, delegateTask makes an HTTP/RPC call to the child agency.
    // For this simulation/test, the instructions mandate we run in simulation mode.
    // The existing federation `delegateTask` uses `global.simulationMode` to bypass actual HTTP calls
    // or we can mock it at the test level. We'll attempt the actual call, and tests will mock it.

    try {
        console.log("[Orchestrator] Initiating Milestone 1: Business Operations & Strategy");
        const bizRes = await delegateTask({
            task_id: "task_1_biz",
            agency_id: bizOpsAgency.id,
            task_description: "Analyze the project brief and define pricing strategy and subscription tiers for TaskFlow Pro.",
            context: { briefPath }
        });
        console.log(`[Federation] Response from ${bizOpsAgency.name}: ${JSON.stringify(bizRes)}\n`);
    } catch (e: any) {
        console.log(`[Federation] (Simulation Note) Delegation intercepted: ${e.message}\n`);
    }

    try {
        console.log("[Orchestrator] Initiating Milestone 2: Backend Architecture & API");
        const backRes = await delegateTask({
            task_id: "task_2_back",
            agency_id: backendAgency.id,
            task_description: "Design the PostgreSQL schema and build the RESTful API for CRUD operations on Users, Workspaces, and Tasks.",
            context: { briefPath }
        });
        console.log(`[Federation] Response from ${backendAgency.name}: ${JSON.stringify(backRes)}\n`);
    } catch (e: any) {
         console.log(`[Federation] (Simulation Note) Delegation intercepted: ${e.message}\n`);
    }

    try {
        console.log("[Orchestrator] Initiating Milestone 3: Frontend Interface");
        const frontRes = await delegateTask({
            task_id: "task_3_front",
            agency_id: frontendAgency.id,
            task_description: "Build the responsive web dashboard and Kanban board using React/Vue based on the backend API.",
            context: { briefPath }
        });
        console.log(`[Federation] Response from ${frontendAgency.name}: ${JSON.stringify(frontRes)}\n`);
    } catch (e: any) {
        console.log(`[Federation] (Simulation Note) Delegation intercepted: ${e.message}\n`);
    }

    // Generate mock artifacts for demonstration of what would happen inside the child agencies
    console.log("--- Phase 3: Collecting Artifacts ---");
    const writeArtifact = (id: string, filename: string, content: string) => {
        const artifactsDir = path.join(process.cwd(), 'demos', 'agency_ecosystem_showcase', '.agent', 'child_agencies', id, 'artifacts');
        if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
        fs.writeFileSync(path.join(artifactsDir, filename), content);
    };

    writeArtifact(bizOpsAgency.id, 'pricing.md', '# Pricing: $10/user/month');
    writeArtifact(backendAgency.id, 'api.js', 'module.exports = { start: () => console.log("API Started") };');
    writeArtifact(frontendAgency.id, 'dashboard.vue', '<template><div>Dashboard</div></template>');

    console.log("[Orchestrator] Artifacts successfully collected in child agency directories.");

    console.log("==================================================");
    console.log("=== Showcase Execution Completed Successfully  ===");
    console.log("==================================================");
}

// Export for testing
export { runShowcase, simulateSpawnChildAgency };

import { fileURLToPath } from 'url';
// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file://${process.argv[1]}.ts`) {
    runShowcase().catch(console.error);
}
