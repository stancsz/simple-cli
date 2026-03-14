import { EpisodicMemory } from "../src/brain/episodic.js";
import { adjustEcosystemMorphology } from "../src/mcp_servers/brain/tools/ecosystem_evolution.js";

/**
 * Demonstrates the Phase 36 Autonomous Ecosystem Evolution capabilities.
 * Simulates an ecosystem structure and executes structural adjustment decisions.
 *
 * @returns {Promise<void>}
 */
async function runEcosystemEvolutionShowcase(): Promise<void> {
  console.log("==================================================");
  console.log("   Phase 36: Autonomous Ecosystem Evolution       ");
  console.log("==================================================");

  // 1. Initialize Memory
  console.log("[1] Initializing Episodic Memory for the root agency...");
  const memory = new EpisodicMemory();

  // We add some simulated history or let the mock metrics drive the LLM
  // We mock a highly inefficient and overloaded state to force spawn, merge, and retire decisions.

  const mockAgencyStatuses = [
    // Overloaded frontend needs help (potential spawn)
    {
      agency_id: "child-frontend-1",
      role: "frontend",
      tasks_assigned: 50,
      tasks_failed: 5,
      utilization_rate: 0.98,
      token_efficiency: 0.8,
    },
    // Underutilized duplicate backends (potential merge)
    {
      agency_id: "child-backend-1",
      role: "backend",
      tasks_assigned: 5,
      tasks_failed: 0,
      utilization_rate: 0.15,
      token_efficiency: 0.9,
    },
    {
      agency_id: "child-backend-2",
      role: "backend",
      tasks_assigned: 3,
      tasks_failed: 0,
      utilization_rate: 0.10,
      token_efficiency: 0.85,
    },
    // Highly inefficient / failing database agency (potential retire)
    {
      agency_id: "child-database-old",
      role: "database",
      tasks_assigned: 10,
      tasks_failed: 8,
      utilization_rate: 0.85,
      token_efficiency: 0.2, // Very poor efficiency
    }
  ];

  console.log("\n[2] Current Ecosystem Topology & Metrics:");
  console.table(mockAgencyStatuses);

  console.log("\n[3] Triggering 'adjust_ecosystem_morphology' tool...");
  console.log("    (The Brain MCP will query meta-learning, market signals, and Health Monitor.)");
  console.log("    (Analyzing and proposing structural changes...)");

  try {
    const decisions = await adjustEcosystemMorphology({ agency_statuses: mockAgencyStatuses }, memory);

    console.log("\n==================================================");
    console.log("   Ecosystem Evolution Decisions Executed         ");
    console.log("==================================================");

    if (decisions.length === 0) {
      console.log("No changes proposed by the Brain.");
    }

    for (const decision of decisions) {
      const actionIcon = decision.action === 'spawn' ? '🌱' :
                         decision.action === 'merge' ? '🔗' :
                         decision.action === 'retire' ? '💀' : '⏸️';

      console.log(`\n${actionIcon} Action: ${decision.action.toUpperCase()}`);

      if (decision.action === 'spawn') {
        console.log(`   New Role: ${decision.config?.role}`);
        console.log(`   Budget limit: ${decision.config?.resource_limit}`);
      } else if (decision.action === 'merge') {
        console.log(`   Targets: ${decision.target_agencies.join(', ')} -> Merge Into: ${decision.config?.merge_into}`);
      } else if (decision.action === 'retire') {
        console.log(`   Targets: ${decision.target_agencies.join(', ')}`);
      }

      console.log(`   Rationale: ${decision.rationale}`);
      if (decision.expected_impact) {
        console.log(`   Impact:    ${decision.expected_impact}`);
      }
    }

    console.log("\n[4] Evolution Cycle Complete.");
    console.log("    The Agency Orchestrator has updated the active swarms based on these decisions.");

  } catch (error) {
    console.error("Showcase failed during morphology adjustment:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEcosystemEvolutionShowcase().catch(console.error);
}

export { runEcosystemEvolutionShowcase };
